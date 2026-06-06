// Complete App.jsx splitter — run with: node split-app.mjs
// Creates all component files with proper imports/exports

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

const src = readFileSync('src/App.jsx', 'utf-8');
const lines = src.split('\n');

mkdirSync('src/lib', { recursive: true });
mkdirSync('src/components', { recursive: true });

// Helper: extract line range (1-indexed, inclusive)
function extract(start, end) {
  return lines.slice(start - 1, end).join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Extract CSS
// ═══════════════════════════════════════════════════════════════════════════
const cssMatch = src.match(/const CSS = `([\s\S]*?)`;/);
if (cssMatch) {
  writeFileSync('src/styles.css', cssMatch[1]);
  console.log('OK: src/styles.css');
} else {
  console.error('FAIL: Could not find CSS template literal');
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Auth.jsx — Splash, StadiumSky, Auth, FField, useBalls, TVBalls, TVLeaderboard
// ═══════════════════════════════════════════════════════════════════════════
const authContent = `import React, { useState, useEffect, useRef } from "react";
import { useLang } from '../lib/i18n';
import { Logo } from './Logo';

${extract(1369, 2045)}

export { Splash, StadiumSky, Auth, FField, useBalls, TVBalls, TVLeaderboard };
`;
writeFileSync('src/components/Auth.jsx', authContent);
console.log('OK: src/components/Auth.jsx');

// ═══════════════════════════════════════════════════════════════════════════
// 3. AppShell.jsx — Main + nav icons
// ═══════════════════════════════════════════════════════════════════════════
const appShellContent = `import React, { useState } from "react";
import { useLang } from '../lib/i18n';
import { Logo } from './Logo';
import { MatchesView } from './Matches';
import { MomentsView } from './Social';
import { LeaderView } from './Leaderboard';
import { MenuView } from './Menu';
import { RulesView, SponsorShowcase, SponsorsSection } from './Profile';
import { ProfileView } from './Profile';
import { SponsorView } from './Profile';
import { OnboardingTutorial, TournamentWinnerScreen } from './Profile';
import { AdminView } from './Admin';
import { KitchenView } from './Kitchen';
import { FloorPlan } from './FloorPlan';

${extract(3285, 3295)}

${extract(2048, 2198)}

export { Main, SoccerIco, TrophyIco, MenuIco, RulesIco, PersonIco, AdminIco, LogoutIco, IcoCheck, IcoX, IcoDash };
`;
writeFileSync('src/components/AppShell.jsx', appShellContent);
console.log('OK: src/components/AppShell.jsx');

// ═══════════════════════════════════════════════════════════════════════════
// 4. Matches.jsx
// ═══════════════════════════════════════════════════════════════════════════
const matchesContent = `import React, { useState, useEffect } from "react";
import { supabase } from '../lib/supabase';
import { sortMatches, flag } from '../lib/utils';
import { IcoCheck, IcoX, IcoDash } from './AppShell';

${extract(2384, 2424)}

${extract(2201, 2382)}

${extract(2426, 2653)}

export { PredictionCountdown, MatchesView, MatchCard, matchKickoff, getGlobalLockMs, useCountdown };
`;
writeFileSync('src/components/Matches.jsx', matchesContent);
console.log('OK: src/components/Matches.jsx');

// ═══════════════════════════════════════════════════════════════════════════
// 5. Social.jsx — MomentsView, SecHead, AField, badges, Av, compressImage, PlayerSearchView, PlayerBadge
// ═══════════════════════════════════════════════════════════════════════════
const socialContent = `import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from '../lib/supabase';
import { calcPts, flag } from '../lib/utils';

${extract(3267, 3283)}

${extract(3363, 3424)}

${extract(2656, 3263)}

${extract(3427, 3549)}

export { MomentsView, SecHead, AField, PlayerBadge, Av, PlayerSearchView, getPlayerBadge, avatarColor, compressImage, BADGE_CFG };
`;
writeFileSync('src/components/Social.jsx', socialContent);
console.log('OK: src/components/Social.jsx');

// ═══════════════════════════════════════════════════════════════════════════
// 6. Leaderboard.jsx
// ═══════════════════════════════════════════════════════════════════════════
const leaderContent = `import React from "react";

${extract(3552, 3630)}

export { LeaderView };
`;
writeFileSync('src/components/Leaderboard.jsx', leaderContent);
console.log('OK: src/components/Leaderboard.jsx');

// ═══════════════════════════════════════════════════════════════════════════
// 7. Profile.jsx — ProfileView, RulesView, SponsorShowcase, SponsorsSection,
//    SponsorView, OnboardingTutorial, TournamentWinnerScreen
// ═══════════════════════════════════════════════════════════════════════════
const profileContent = `import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from '../lib/supabase';
import { Av, compressImage, SponsorsSection as _unused } from './Social';
import { QRTableScanner } from './Menu';

${extract(3633, 3658)}

${extract(3660, 3983)}

${extract(3986, 4255)}

const TIER_META = {
  gold:   { label:"GOLD",   color:"#FFD700", bg:"rgba(255,215,0,.12)",   icon:"\\u{1F947}" },
  silver: { label:"SILVER", color:"#C0C0C0", bg:"rgba(192,192,192,.12)", icon:"\\u{1F948}" },
};

${extract(5867, 6099)}

${extract(5580, 5740)}

${extract(3299, 3361)}

export { ProfileView, RulesView, SponsorShowcase, SponsorsSection, SponsorView, OnboardingTutorial, TournamentWinnerScreen, SPONSORS_LIST, TIER_META };
`;
writeFileSync('src/components/Profile.jsx', profileContent);
console.log('OK: src/components/Profile.jsx');

// ═══════════════════════════════════════════════════════════════════════════
// 8. Menu.jsx — GroupOrderView, MenuView, QRTableScanner, MenuItemForm
// ═══════════════════════════════════════════════════════════════════════════
const menuContent = `import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from '../lib/supabase';
import { useLang } from '../lib/i18n';
import jsQR from "jsqr";

${extract(5741, 5866)}

${extract(7352, 7385)}

${extract(6100, 7435)}

export { GroupOrderView, MenuView, QRTableScanner, MenuItemForm, MENU_SECTIONS, ALL_MENU_CATS, FOOD_CATS, catMeta };
`;
writeFileSync('src/components/Menu.jsx', menuContent);
console.log('OK: src/components/Menu.jsx');

// ═══════════════════════════════════════════════════════════════════════════
// 9. Admin.jsx
// ═══════════════════════════════════════════════════════════════════════════
const adminContent = `import React, { useState, useEffect, useRef } from "react";
import { supabase } from '../lib/supabase';
import { sortMatches, flag } from '../lib/utils';
import { AField } from './Social';
import { AdminMenu, AdminCredits, MENU_SECTIONS, ALL_MENU_CATS, FOOD_CATS, catMeta } from './AdminMenu';
import { AdminHistory, AdminReport, printReceipt } from './AdminMore';

${extract(4258, 5618)}

export { AdminView, AdminDashboard, AdminAppSettings, AdminFloorplanAccess, AdminKitchenAccess, AdminIntegrity, AdminTableQR, AdminTables, AdminMatches, AdminMatchRow, AdminEditCard, AdminRules, AdminSponsors, AdminSponsorPerks };
`;
writeFileSync('src/components/Admin.jsx', adminContent);
console.log('OK: src/components/Admin.jsx');

// AdminMenu.jsx (AdminMenu + AdminCredits + MenuItemForm for admin)
const adminMenuContent = `import React, { useState, useEffect, useRef } from "react";
import { supabase } from '../lib/supabase';
import { AField } from './Social';
import { MenuItemForm, MENU_SECTIONS, ALL_MENU_CATS, FOOD_CATS, catMeta } from './Menu';

${extract(7436, 7645)}

export { AdminMenu, AdminCredits, MENU_SECTIONS, ALL_MENU_CATS, FOOD_CATS, catMeta };
`;
writeFileSync('src/components/AdminMenu.jsx', adminMenuContent);
console.log('OK: src/components/AdminMenu.jsx');

// AdminMore.jsx (printReceipt + AdminHistory + AdminReport)
const adminMoreContent = `import React, { useState } from "react";

${extract(7646, 8161)}

export { printReceipt, AdminHistory, AdminReport };
`;
writeFileSync('src/components/AdminMore.jsx', adminMoreContent);
console.log('OK: src/components/AdminMore.jsx');

// ═══════════════════════════════════════════════════════════════════════════
// 10. Kitchen.jsx
// ═══════════════════════════════════════════════════════════════════════════
const kitchenContent = `import React, { useState, useEffect, useRef } from "react";
import { supabase } from '../lib/supabase';

${extract(8162, 8396)}

export { KitchenView };
`;
writeFileSync('src/components/Kitchen.jsx', kitchenContent);
console.log('OK: src/components/Kitchen.jsx');

// ═══════════════════════════════════════════════════════════════════════════
// 11. FloorPlan.jsx
// ═══════════════════════════════════════════════════════════════════════════
const floorPlanContent = `import React, { useState, useEffect, useRef } from "react";
import { supabase } from '../lib/supabase';
import { printReceipt } from './AdminMore';

${extract(8128, 9097)}

export { FloorPlan };
`;
writeFileSync('src/components/FloorPlan.jsx', floorPlanContent);
console.log('OK: src/components/FloorPlan.jsx');

// ═══════════════════════════════════════════════════════════════════════════
// 12. Rewrite App.jsx
// ═══════════════════════════════════════════════════════════════════════════
const appLines = extract(1, 9);
const appFn = extract(201, 1366);

const newApp = `import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from './lib/supabase';
import { TRANSLATIONS, LangContext, useLang } from './lib/i18n';
import { sget, sset, DEFAULT_MATCHES, DEFAULT_RULES, DEFAULT_SPONSORS, calcPts, sortMatches, matchDate, flag } from './lib/utils';
import { Logo } from './components/Logo';
import { Auth } from './components/Auth';
import { Main } from './components/AppShell';
import { OnboardingTutorial } from './components/Profile';
import { getGlobalLockMs } from './components/Matches';
import './styles.css';

const ONBOARDING_KEY = "em_onboarding_v2";

${appFn}
`;
writeFileSync('src/App.jsx', newApp);
console.log('OK: src/App.jsx (rewritten)');

console.log('\n=== SPLIT COMPLETE ===');
console.log('Run: npm run build');
