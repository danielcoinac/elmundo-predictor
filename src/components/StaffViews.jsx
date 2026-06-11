import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";

function getEventLabelSV() {
  try { const s = JSON.parse(localStorage.getItem("em_app_settings")||"{}"); return `${s.eventName||"WORLD CUP"} ${s.eventYear||2026}`; } catch { return "WORLD CUP 2026"; }
}

function printReceipt(ord) {
  const eventLabel = getEventLabelSV();
  const date = new Date(ord.created_at);
  const dateStr = date.toLocaleDateString("en-US",{weekday:"short",year:"numeric",month:"long",day:"numeric"});
  const timeStr = date.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});
  const items = (ord.items || []).map(it => `
    <tr>
      <td style="padding:7px 0;font-size:20px;font-weight:900;line-height:1.2;">${it.qty}× ${it.name.toUpperCase()}</td>
      <td style="padding:7px 0;font-size:12px;font-weight:600;text-align:right;color:#555;vertical-align:bottom;">${(it.price*it.qty).toFixed(2)}</td>
    </tr>`).join("");
  const isSponsor = ord.payment_method === "sponsor_gift";
  const payLabel = ord.payment_method === "credits" ? "CREDITS" : ord.payment_method === "card" ? "CARD" : ord.payment_method === "cash" ? "CASH / CARD AT BAR" : isSponsor ? "COMPLIMENTARY · VIP PERK" : ord.payment_method?.startsWith("group") ? "GROUP ORDER" : "CASH";
  const sponsorName = (ord.user_name || "SPONSOR").toUpperCase();

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
    td { font-size: 17px; padding: 6px 0; font-weight: 800; }
    .total-row td { font-size: 14px; font-weight: 900; letter-spacing: 1px; padding-top: 8px; border-top: 3px solid #000; }
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
      <div class="event">${eventLabel} EVENT</div>
      <div class="loc">KRALENDIJK · BONAIRE · EST. 2009</div>
    </div>

    ${isSponsor ? `
    <div style="text-align:center;margin:8px 0 10px;padding:8px 6px;border:3px double #000;background:#000;color:#fff;">
      <div style="font-size:9px;font-weight:900;letter-spacing:4px;">⭐ VIP PERK ORDER ⭐</div>
      <div style="font-size:18px;font-weight:900;letter-spacing:2px;margin-top:3px;line-height:1.1;">${sponsorName}</div>
      <div style="font-size:8px;font-weight:700;letter-spacing:3px;margin-top:2px;">BRING TO SPONSOR</div>
    </div>
    ` : ""}

    <div class="meta-row"><span class="meta-lbl">Date</span><span class="meta-val">${dateStr}</span></div>
    <div class="meta-row"><span class="meta-lbl">Time</span><span class="meta-val">${timeStr}</span></div>
    ${isSponsor
      ? `<div class="meta-row"><span class="meta-lbl">Sponsor</span><span class="meta-val">${sponsorName}</span></div>`
      : `<div class="meta-row"><span class="meta-lbl">Table</span><span class="meta-val">${String(ord.table_number).startsWith("OUT-") ? "ZONE " + String(ord.table_number).replace("OUT-","") : ord.table_number}</span></div>`}
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
      <div class="wc">⚽ ${eventLabel} ⚽</div>
      <div class="url">www.elmundobonaire.com</div>
    </div>

  </div></body></html>`;

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;opacity:0;";
  document.body.appendChild(iframe);
  iframe.contentDocument.open();
  iframe.contentDocument.write(html);
  iframe.contentDocument.close();
  iframe.contentWindow.onafterprint = () => { try { document.body.removeChild(iframe); } catch(e) {} };
  setTimeout(() => { try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch(e) {} }, 300);
}

/* ═══ MANUAL ORDER PANEL ════════════════════════════════════════════════════ */
function ManualOrderPanel({ menuItems = [], isP2, onClose, onOrderPlaced }) {
  const [cart,          setCart        ] = useState([]);
  const [search,        setSearch      ] = useState("");
  const [allUsers,      setAllUsers    ] = useState([]);
  const [placing,       setPlacing     ] = useState(false);
  const [msg,           setMsg         ] = useState(null);
  const [confirmClose,  setConfirmClose] = useState(false);
  // Checkout overlay state: null | "pay-method" | "credits-player"
  const [checkoutStep,  setCheckoutStep] = useState(null);
  const [creditsSearch, setCreditsSearch] = useState("");
  const [creditsUser,   setCreditsUser ] = useState(null);
  const creditsSearchRef = useRef(null);

  // Fetch all users + credit balances once
  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: profs }, { data: bals }] = await Promise.all([
        supabase.from("profiles").select("id,name,phone,player_number,is_admin").order("name").limit(2000),
        supabase.from("user_credits").select("user_id,balance"),
      ]);
      if (!alive) return;
      const balMap = new Map((bals || []).map(b => [b.user_id, +b.balance || 0]));
      setAllUsers((profs || []).filter(p => p.is_admin !== true).map(p => ({ ...p, credits: balMap.get(p.id) || 0 })));
    })();
    return () => { alive = false; };
  }, []);

  // Auto-dismiss success toast
  useEffect(() => {
    if (msg?.ok) { const t = setTimeout(() => setMsg(null), 3000); return () => clearTimeout(t); }
  }, [msg]);

  // Focus credits search when step 2 opens
  useEffect(() => {
    if (checkoutStep === "credits-player") setTimeout(() => creditsSearchRef.current?.focus(), 80);
  }, [checkoutStep]);

  const filtered = menuItems
    .filter(i => i.available && !i.sold_out)
    .filter(i => !search.trim() || i.name.toLowerCase().includes(search.toLowerCase().trim()));

  const cartQty = id => cart.find(c => c.id === id)?.qty || 0;

  const addItem = item => setCart(prev => {
    const ex = prev.find(c => c.id === item.id);
    if (ex) return prev.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c);
    return [...prev, { id: item.id, name: item.name, price: +item.price, qty: 1 }];
  });

  const removeItem = id => setCart(prev => {
    const ex = prev.find(c => c.id === id);
    if (!ex || ex.qty <= 1) return prev.filter(c => c.id !== id);
    return prev.map(c => c.id === id ? { ...c, qty: c.qty - 1 } : c);
  });

  const total = cart.reduce((s, c) => s + c.price * c.qty, 0);

  const filteredUsers = (() => {
    const q = creditsSearch.trim().toLowerCase();
    if (q.length < 2) return [];
    const digits = q.replace(/\D/g, "");
    return allUsers.filter(u => {
      const n = (u.name || "").toLowerCase();
      const p = String(u.phone || "").toLowerCase();
      const num = String(u.player_number || "");
      return n.includes(q) || (digits && p.includes(digits)) || (digits && num === digits);
    });
  })();

  const insufficientCredits = !!creditsUser && (creditsUser.credits || 0) < total;

  const nextOrderNumber = async () => {
    try {
      const { data } = await supabase.from("orders").select("order_number").gte("order_number", 8000).order("order_number", { ascending: false }).limit(1);
      return Math.max(8000, (data?.[0]?.order_number || 7999) + 1);
    } catch { return 9000000 + (Date.now() % 1000000); }
  };

  const placeOrder = async (paymentMethod, player = null) => {
    if (placing) return;
    setPlacing(true); setMsg(null);
    try {
      const orderNum = await nextOrderNumber();
      let freshUser = player;
      if (paymentMethod === "credits" && player) {
        const { data: row } = await supabase.from("user_credits").select("balance").eq("user_id", player.id).maybeSingle();
        const fresh = +(row?.balance || 0);
        freshUser = { ...player, credits: fresh };
        if (fresh < total) throw new Error(`Not enough credits — $${(total - fresh).toFixed(2)} short`);
      }

      const { data: ord, error } = await supabase.from("orders").insert({
        table_number:   "BAR",
        user_name:      paymentMethod === "credits" && freshUser ? freshUser.name : "BAR ORDER",
        user_id:        paymentMethod === "credits" && freshUser ? freshUser.id   : null,
        items:          cart,
        total,
        status:         "completed",
        payment_method: paymentMethod,
        order_number:   orderNum,
      }).select().single();
      if (error) throw error;

      if (paymentMethod === "credits" && freshUser) {
        const newBal = Math.max(0, (freshUser.credits || 0) - total);
        await supabase.from("user_credits").upsert({ user_id: freshUser.id, balance: newBal, updated_at: new Date().toISOString() });
        setAllUsers(prev => prev.map(u => u.id === freshUser.id ? { ...u, credits: newBal } : u));
      }

      if (localStorage.getItem("em-printer-zone")) {
        try { printReceipt(ord); } catch(_) {}
      }

      setMsg({ ok: true, text: `✓ Order #${orderNum} placed${localStorage.getItem("em-printer-zone") ? " — printing" : ""}` });
      setCart([]); setCheckoutStep(null); setCreditsUser(null); setCreditsSearch("");
      if (onOrderPlaced) onOrderPlaced();
    } catch (e) {
      setMsg({ ok: false, text: "Error: " + (e.message || "failed") });
      // On error stay on credits step so staff can retry
    }
    setPlacing(false);
  };

  const openCheckout = () => { setCheckoutStep("pay-method"); setMsg(null); };

  const backFromCheckout = () => {
    if (checkoutStep === "credits-player") { setCheckoutStep("pay-method"); setCreditsUser(null); setCreditsSearch(""); }
    else setCheckoutStep(null);
  };

  const requestClose = () => {
    if (checkoutStep) { backFromCheckout(); return; }
    if (cart.length > 0 && !confirmClose) { setConfirmClose(true); return; }
    onClose?.();
  };

  // Cart summary component reused in both checkout steps
  const CartSummary = () => (
    <div className="mo-co-cart">
      {cart.map(c => (
        <div key={c.id} className="mo-co-cart-row">
          <span className="mo-co-cart-qty">{c.qty}×</span>
          <span className="mo-co-cart-name">{c.name}</span>
          <span className="mo-co-cart-price">${(c.price * c.qty).toFixed(2)}</span>
        </div>
      ))}
      <div className="mo-co-total-row">
        <span>TOTAL</span>
        <span className="mo-co-total-val">${total.toFixed(2)}</span>
      </div>
    </div>
  );

  return createPortal(
    <>
      <div className="mo-backdrop" onClick={requestClose} />
      <div className="mo-panel" role="dialog" aria-label="Manual order panel">

        {/* ── Header ── */}
        <div className="mo-header">
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {checkoutStep && (
              <button onClick={backFromCheckout} className="mo-back-btn" aria-label="Back">←</button>
            )}
            <div>
              <div className="mo-title">
                {checkoutStep === "pay-method" ? "PAYMENT METHOD" : checkoutStep === "credits-player" ? "PLAYER ACCOUNT" : "MANUAL ORDER"}
              </div>
              <div className="mo-sub">🌴 OUTDOOR BAR</div>
            </div>
          </div>
          <button className="mo-close" onClick={requestClose} aria-label="Close">✕</button>
        </div>

        {/* ── Main menu body (hidden when checkout overlay is open) ── */}
        {!checkoutStep && (
          <>
            <div className="mo-body">

              {confirmClose && (
                <div style={{padding:"10px 16px",background:"rgba(248,113,113,.1)",borderBottom:"1px solid rgba(248,113,113,.25)",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                  <div style={{flex:1,minWidth:140,fontFamily:"'Outfit',sans-serif",fontSize:12,color:"#fca5a5"}}>
                    Discard {cart.length} item{cart.length !== 1 ? "s" : ""} in cart?
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={() => { setCart([]); setConfirmClose(false); onClose?.(); }}
                      style={{padding:"6px 12px",background:"rgba(248,113,113,.2)",border:"1px solid rgba(248,113,113,.5)",color:"#f87171",fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:1,cursor:"pointer",borderRadius:5}}>
                      DISCARD
                    </button>
                    <button onClick={() => setConfirmClose(false)}
                      style={{padding:"6px 12px",background:"transparent",border:"1px solid rgba(255,255,255,.15)",color:"rgba(255,255,255,.55)",fontFamily:"'Outfit',sans-serif",fontSize:11,cursor:"pointer",borderRadius:5}}>
                      Keep
                    </button>
                  </div>
                </div>
              )}

              {/* Search bar */}
              <div className="mo-section" style={{paddingBottom:6,paddingTop:14}}>
                <input className="mo-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍  Search items…" autoComplete="off" />
              </div>

              {/* Menu items — bigger rows */}
              <div className="mo-items">
                {filtered.length === 0 && <div className="mo-empty">No items found</div>}
                {filtered.map(item => {
                  const qty = cartQty(item.id);
                  const cat = (item.category || "").toUpperCase();
                  return (
                    <div key={item.id} className={`mo-item-row${qty > 0 ? " mo-item-row-active" : ""}`}>
                      <div className="mo-item-info">
                        <div className="mo-item-name">{item.name}</div>
                        <div className="mo-item-meta">
                          {cat && <span className="mo-item-cat">{cat}</span>}
                          <span className="mo-item-price">${(+item.price).toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="mo-item-ctrl">
                        {qty > 0 && (
                          <>
                            <button className="mo-qty-btn mo-qty-minus" onClick={() => removeItem(item.id)}>−</button>
                            <span className="mo-qty-val">{qty}</span>
                          </>
                        )}
                        <button className="mo-qty-btn mo-qty-plus" onClick={() => addItem(item)}>+</button>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>

            {/* Footer: cart summary + checkout CTA */}
            {cart.length > 0 && (
              <div className="mo-footer">
                <div className="mo-footer-scroll">
                  <div className="mo-cart">
                    {cart.map(c => (
                      <div key={c.id} className="mo-cart-row">
                        <span className="mo-cart-item">{c.qty}× {c.name}</span>
                        <span className="mo-cart-price">${(c.price * c.qty).toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="mo-cart-total">
                      <span>TOTAL</span>
                      <span className="mo-total-val">${total.toFixed(2)}</span>
                    </div>
                  </div>
                  {msg && <div className={`mo-msg ${msg.ok ? "mo-msg-ok" : "mo-msg-err"}`} style={{margin:"0 0 8px"}}>{msg.text}</div>}
                </div>
                <div className="mo-footer-action">
                  <button className="mo-place-btn mo-place-btn-active" onClick={openCheckout}>
                    CHECKOUT · ${total.toFixed(2)}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── CHECKOUT: Step 1 — Payment method ── */}
        {checkoutStep === "pay-method" && (
          <div className="mo-checkout">
            <CartSummary />

            <div className="mo-co-prompt">HOW WILL THE CUSTOMER PAY?</div>

            <div className="mo-co-methods">
              <button className="mo-co-method mo-co-method-credits" onClick={() => setCheckoutStep("credits-player")}>
                <span className="mo-co-method-icon">💳</span>
                <div className="mo-co-method-text">
                  <div className="mo-co-method-title">ACCOUNT CREDIT BALANCE</div>
                  <div className="mo-co-method-sub">Deduct from player's wallet</div>
                </div>
                <span className="mo-co-method-arrow">›</span>
              </button>
              <button className="mo-co-method mo-co-method-cash" onClick={() => placeOrder("cash")} disabled={placing}>
                <span className="mo-co-method-icon">💵</span>
                <div className="mo-co-method-text">
                  <div className="mo-co-method-title">CASH / CARD AT BAR</div>
                  <div className="mo-co-method-sub">Register order — collect payment at bar</div>
                </div>
                {placing ? <span className="mo-co-method-arrow" style={{fontSize:12,opacity:.5}}>…</span> : <span className="mo-co-method-arrow">›</span>}
              </button>
            </div>

            {msg && <div className={`mo-msg ${msg.ok ? "mo-msg-ok" : "mo-msg-err"}`} style={{margin:"16px"}}>{msg.text}</div>}
          </div>
        )}

        {/* ── CHECKOUT: Step 2 — Select player ── */}
        {checkoutStep === "credits-player" && (
          <div className="mo-checkout">
            <CartSummary />

            <div className="mo-co-prompt">SEARCH PLAYER ACCOUNT</div>

            {!creditsUser ? (
              <div style={{padding:"0 16px"}}>
                <input
                  ref={creditsSearchRef}
                  className="mo-credits-search"
                  value={creditsSearch}
                  onChange={e => setCreditsSearch(e.target.value)}
                  placeholder="🔍  Name, phone, or player #…"
                  style={{width:"100%",boxSizing:"border-box",fontSize:15,padding:"12px 14px"}}
                />
                {filteredUsers.length > 0 && (
                  <div className="mo-credits-list" style={{marginTop:8}}>
                    {filteredUsers.slice(0, 8).map(u => (
                      <div key={u.id} onClick={() => setCreditsUser(u)} className="mo-credits-row" style={{padding:"12px 14px"}}>
                        <div style={{display:"flex",flexDirection:"column",gap:2,minWidth:0}}>
                          <span className="mo-credits-name" style={{fontSize:15}}>
                            {u.name}
                            {u.player_number ? <span style={{fontFamily:"'Anton',sans-serif",fontSize:11,color:"rgba(255,255,255,.35)",marginLeft:8}}>#{u.player_number}</span> : null}
                          </span>
                          {u.phone && <span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.3)"}}>{u.phone}</span>}
                        </div>
                        <span className={`mo-credits-bal ${(u.credits||0) >= total ? "mo-bal-ok" : "mo-bal-low"}`} style={{fontSize:16}}>
                          ${(u.credits || 0).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {creditsSearch.trim().length >= 2 && filteredUsers.length === 0 && (
                  <div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.3)",padding:"12px 2px"}}>No players found</div>
                )}
              </div>
            ) : (
              <div style={{padding:"0 16px",display:"flex",flexDirection:"column",gap:12}}>
                {/* Selected player card */}
                <div className={`mo-co-player-card ${insufficientCredits ? "mo-co-player-low" : "mo-co-player-ok"}`}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontFamily:"'Outfit',sans-serif",fontSize:16,fontWeight:700,color:"#fff",marginBottom:2}}>
                      {creditsUser.name}
                      {creditsUser.player_number ? <span style={{marginLeft:8,opacity:.5,fontFamily:"'Anton',sans-serif",fontSize:12}}>#{creditsUser.player_number}</span> : null}
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                      <span style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.45)"}}>Balance:</span>
                      <span style={{fontFamily:"'Anton',sans-serif",fontSize:18,color:insufficientCredits?"#f87171":"#4ade80"}}>${(creditsUser.credits||0).toFixed(2)}</span>
                      {!insufficientCredits && <>
                        <span style={{color:"rgba(255,255,255,.2)"}}>→</span>
                        <span style={{fontFamily:"'Anton',sans-serif",fontSize:18,color:"rgba(74,222,128,.7)"}}>${Math.max(0,(creditsUser.credits||0)-total).toFixed(2)}</span>
                      </>}
                    </div>
                    {insufficientCredits && (
                      <div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"#f87171",marginTop:4}}>
                        ⚠ ${(total-(creditsUser.credits||0)).toFixed(2)} short — top up first
                      </div>
                    )}
                  </div>
                  <button onClick={() => { setCreditsUser(null); setCreditsSearch(""); }}
                    style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",color:"rgba(255,255,255,.4)",width:28,height:28,borderRadius:"50%",cursor:"pointer",fontSize:13,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                </div>

                {msg && <div className={`mo-msg ${msg.ok ? "mo-msg-ok" : "mo-msg-err"}`}>{msg.text}</div>}

                {!insufficientCredits && (
                  <button
                    className="mo-place-btn mo-place-btn-active"
                    onClick={() => placeOrder("credits", creditsUser)}
                    disabled={placing}
                    style={{fontSize:14,letterSpacing:2,padding:"16px 20px"}}
                  >
                    {placing ? "PLACING…" : `CHARGE $${total.toFixed(2)} FROM BALANCE`}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </>,
    document.body
  );
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
                  <div className="history-order-items-inline">{(ord.items||[]).map(it=>`${it.qty}x ${it.name}`).join(" · ")}</div>
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

  // Clean payment method label for display
  const payMethodLabel = (key) => ({
    credits: "Credits", cash: "Cash", card: "Card / Online",
    group: "Group Order", group_host: "Group Order (Host)", group_individual: "Group Order",
    sponsor_gift: "Complimentary (Gift)",
  }[key] || key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()));

  // Compare using LOCAL date of the timestamp (not raw UTC slice)
  const inRange = (ts) => { if (!ts) return false; const d = localDate(ts); return d >= finFrom && d <= finTo; };

  const filtered = allOrders.filter(o => inRange(o.created_at));
  const filteredTopups = topups.filter(t => inRange(t.created_at));

  const totalRevenue    = filtered.reduce((s,o) => s + (+o.total), 0);
  const orderCount      = filtered.length;

  // By payment method — consolidate group variants into single bucket
  const normalizePay = (m) => m?.startsWith("group") ? "group" : (m || "unknown");
  const byPay = {};
  filtered.forEach(o => {
    const m = normalizePay(o.payment_method);
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
    `<div class="row">${pad(payMethodLabel(k), `${v.orders}x  ${cur(v.total)}`)}</div>`
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
        <button onClick={handlePrint} style={{display:"flex",alignItems:"center",gap:7,padding:"9px 18px",background:"#fff",color:"#000",border:"none",fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:2,cursor:"pointer",fontWeight:900,boxShadow:"0 4px 16px rgba(255,255,255,.1)"}}>
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
            fontFamily:"'Anton',sans-serif", fontSize:9, letterSpacing:2, cursor:"pointer", whiteSpace:"nowrap",
            fontWeight: preset===v ? 900 : 400,
            boxShadow: preset===v ? "0 2px 10px rgba(255,255,255,.12)" : "none",
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
          ...Object.entries(byPay).filter(([k])=>!["credits","cash","card"].includes(k)).map(([k,v])=>[payMethodLabel(k),v,"rgba(255,255,255,.5)"]),
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
function FloorPlan({ allOrders, onLoad, onUpdateStatus, onDeleteOrder, onToast = ()=>{}, userId = null, menuItems = [] }) {
  const [showMO,       setShowMO      ] = useState(false);
  const [pickupSearch, setPickupSearch] = useState("");
  const [clearingId,   setClearingId  ] = useState(null);
  const [fpView,       setFpView      ] = useState("live");
  const [showFin,      setShowFin     ] = useState(false);

  // Auto-refresh every 10 s + cancel abandoned card_pending orders
  useEffect(() => {
    const refresh = async () => {
      await onLoad();
      const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      await supabase.from("orders")
        .update({ status: "cancelled" })
        .in("status", ["pending", "confirmed"])
        .eq("payment_method", "card_pending")
        .lt("created_at", cutoff);
    };
    refresh();
    const iv = setInterval(refresh, 10000);
    return () => clearInterval(iv);
  }, []);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const todayStr     = new Date().toDateString();
  const todayOrders  = allOrders.filter(o => new Date(o.created_at).toDateString() === todayStr);
  const todayRevenue = todayOrders.reduce((s, o) => s + (+o.total || 0), 0);
  const todayCount   = todayOrders.length;

  // Active = confirmed normal orders (sponsors are auto-handled, not queued here)
  const activeOrders = allOrders
    .filter(o =>
      (o.status === "confirmed" || (o.status === "pending" && o.payment_method !== "card_pending"))
      && o.order_number
      && o.payment_method !== "sponsor_gift"
    )
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  // Search filter
  const searchQ = pickupSearch.trim().toLowerCase();
  const filteredOrders = searchQ
    ? activeOrders.filter(o =>
        String(o.order_number).includes(searchQ) ||
        (o.user_name || "").toLowerCase().includes(searchQ)
      )
    : activeOrders;

  // Payment label
  const payLabel = m =>
    m === "credits"      ? "CREDITS" :
    m === "card"         ? "CARD" :
    m === "cash"         ? "CASH" :
    m === "sponsor_gift" ? "VIP GIFT" :
    m?.startsWith("group") ? "GROUP" :
    (m || "CASH").toUpperCase();

  // Clear order: mark completed + auto-print receipt
  const clearOrder = async (ord) => {
    setClearingId(ord.id);
    await supabase.from("orders").update({ status: "completed" }).eq("id", ord.id);
    try { printReceipt(ord); } catch(e) {}
    await onLoad();
    setClearingId(null);
    onToast(`Order #${String(ord.order_number).padStart(2,"0")} cleared ✓`);
  };

  return (
    <div className="fp-root">

      {/* ── HEADER ────────────────────────────────────────────────────────────────── */}
      <div className="fp-header">
        <div className="fp-header-row1">
          <span className="fp-title">OUTDOOR BAR</span>
          <div className="fp-view-toggle">
            {[{id:"live",label:"LIVE"},{id:"history",label:"HISTORY"},{id:"report",label:"REPORT"}].map(v=>(
              <button key={v.id} onClick={()=>setFpView(v.id)}
                className={`fp-view-btn ${fpView===v.id?"fp-view-btn-on":""}`}>
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {fpView === "live" && (
          <div className="fp-stats-grid fp-stats-3">
            <div className="fp-stat-card" style={{background:activeOrders.length>0?"rgba(74,222,128,.06)":"rgba(255,255,255,.02)",borderColor:activeOrders.length>0?"rgba(74,222,128,.25)":"rgba(255,255,255,.06)"}}>
              <div className="fp-stat-num" style={{color:activeOrders.length>0?"#4ade80":"rgba(255,255,255,.15)",textShadow:activeOrders.length>0?"0 0 20px rgba(74,222,128,.3)":"none"}}>{activeOrders.length}</div>
              <div className="fp-stat-label">ACTIVE</div>
            </div>
            <div className="fp-stat-card" style={{background:"rgba(255,255,255,.03)",borderColor:"rgba(255,255,255,.12)"}}>
              <div className="fp-stat-num" style={{color:"#fff",filter:showFin?"none":"blur(10px)",userSelect:showFin?"auto":"none",textShadow:showFin?"0 0 16px rgba(255,255,255,.2)":"none"}}>${todayRevenue.toFixed(0)}</div>
              <div className="fp-stat-label" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                <span>TODAY REV</span>
                <button onClick={()=>setShowFin(v=>!v)} style={{background:"none",border:"none",cursor:"pointer",padding:"1px 2px",lineHeight:1,opacity:.5,fontSize:11}}>{showFin?"👁":"🙈"}</button>
              </div>
            </div>
            <div className="fp-stat-card" style={{background:"rgba(255,255,255,.02)",borderColor:"rgba(255,255,255,.1)"}}>
              <div className="fp-stat-num" style={{color:"#fff",filter:showFin?"none":"blur(10px)",userSelect:showFin?"auto":"none"}}>{todayCount}</div>
              <div className="fp-stat-label">ORDERS TODAY</div>
            </div>
          </div>
        )}
      </div>

      {/* ── LIVE VIEW ─────────────────────────────────────────────────────────────── */}
      {fpView === "live" && (
        <div className="fp-live-wrap">

          {/* Toolbar: new order toggle + search */}
          <div className="fp-toolbar">
            <button className={`fp-new-order-btn${showMO?" fp-new-order-btn-close":""}`} onClick={()=>setShowMO(v=>!v)}>
              {showMO ? "✕ CLOSE ORDER" : "➕ NEW ORDER"}
            </button>
            <input
              className="fp-search-input"
              value={pickupSearch}
              onChange={e=>setPickupSearch(e.target.value)}
              placeholder="Search # or name…"
            />
          </div>

          {/* Order list */}
          <div className="fp-orders-list">
            {filteredOrders.length === 0 && (
              <div className="fp-orders-empty">
                {activeOrders.length === 0
                  ? <><span className="fp-empty-icon">✓</span><span>No active orders</span></>
                  : "No match"}
              </div>
            )}
            {filteredOrders.map(ord => {
              const isSponsor  = ord.payment_method === "sponsor_gift";
              const isCash     = ord.payment_method === "cash";
              const isClearing = clearingId === ord.id;
              const numStr     = String(ord.order_number).padStart(2,"0");
              const itemsStr   = (ord.items||[]).map(i=>`${i.qty}× ${i.name}`).join(" · ");
              return (
                <div key={ord.id} className={`fp-order-row${isSponsor?" fp-order-row-vip":""}`}>
                  {/* Pickup number badge */}
                  <div className={`fp-order-num${isCash?" fp-order-num-cash":isSponsor?" fp-order-num-vip":""}`}>
                    {numStr}
                  </div>
                  {/* Details */}
                  <div className="fp-order-details">
                    <div className="fp-order-name">{ord.user_name || "—"}</div>
                    <div className="fp-order-items">{itemsStr}</div>
                    <div className="fp-order-meta">
                      <span className="fp-order-total">${(+ord.total).toFixed(2)}</span>
                      <span className="fp-order-pay">{payLabel(ord.payment_method)}</span>
                      {isCash    && <span className="fp-badge fp-badge-cash">PAY AT BAR</span>}
                      {isSponsor && <span className="fp-badge fp-badge-vip">VIP</span>}
                    </div>
                    <div className="fp-order-time">{new Date(ord.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
                  </div>
                  {/* Clear button */}
                  <button className="fp-clear-btn" onClick={()=>clearOrder(ord)} disabled={isClearing}>
                    {isClearing ? "…" : "✓ DONE"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── HISTORY VIEW ───────────────────────────────────────────────────────────── */}
      {fpView === "history" && <AdminHistory allOrders={allOrders} />}

      {/* ── REPORT VIEW ─────────────────────────────────────────────────────────────── */}
      {fpView === "report" && <AdminReport allOrders={allOrders} />}

      {/* ── MANUAL ORDER PANEL ────────────────────────────────────────────────────────── */}
      {showMO && (
        <ManualOrderPanel
          menuItems={menuItems}
          isP2={true}
          onClose={()=>setShowMO(false)}
          onOrderPlaced={onLoad}
        />
      )}
    </div>
  );
}

/* ═══ ORDER FEED ════════════════════════════════════════════════════════════ */
function OrderFeed({ allOrders = [], menuItems = [], onToggleSoldOut = () => {} }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(iv);
  }, []);

  // ── Live order feed ──────────────────────────────────────────────────────
  const recentOrders = [...allOrders]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 30);

  const timeAgo = (ts) => {
    const mins = Math.floor((now - new Date(ts).getTime()) / 60000);
    if (mins < 1) return "<1m ago";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
  };

  const formatTable = (t) => {
    const s = String(t || "");
    if (s.startsWith("OUT-")) return `🌴 ${s.replace("OUT-", "")}`;
    return `TABLE ${s}`;
  };

  const payLabel = (m) =>
    m === "credits" ? "CREDITS" :
    m === "card" ? "CARD" :
    m === "sponsor_gift" ? "GIFT" :
    m?.startsWith("group") ? "GROUP" :
    (m || "CASH").toUpperCase();

  // ── Availability toggles ─────────────────────────────────────────────────
  const grouped = menuItems.reduce((acc, item) => {
    const cat = item.category || "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  return (
    <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "12px 14px 40px" }}>

      {/* ── SECTION: LIVE ORDERS ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{
          fontFamily: "'Anton',sans-serif", fontSize: 13, letterSpacing: 3, color: "#fff"
        }}>LIVE ORDERS</span>
        {/* Green pulsing dot */}
        <span style={{
          display: "inline-block", width: 8, height: 8, borderRadius: "50%",
          background: "#4ade80", boxShadow: "0 0 6px #4ade80",
          animation: "of-pulse 1.6s ease-in-out infinite",
        }} />
        <span style={{
          fontFamily: "'Outfit',sans-serif", fontSize: 11, color: "rgba(255,255,255,.35)",
          marginLeft: "auto"
        }}>{recentOrders.length} orders</span>
      </div>

      <style>{`
        @keyframes of-pulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:.4; transform:scale(1.4); }
        }
      `}</style>

      {recentOrders.length === 0 && (
        <div style={{
          padding: "28px 0", textAlign: "center",
          fontFamily: "'Outfit',sans-serif", fontSize: 13, color: "rgba(255,255,255,.2)"
        }}>No orders yet</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 32 }}>
        {recentOrders.map(ord => (
          <div key={ord.id} style={{
            background: "rgba(255,255,255,.03)",
            border: "1px solid rgba(255,255,255,.1)",
            padding: "10px 14px",
          }}>
            {/* Card top row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
              <div>
                <span style={{
                  fontFamily: "'Anton',sans-serif", fontSize: 13, color: "#fff", letterSpacing: 1
                }}>{formatTable(ord.table_number)}</span>
                {ord.order_number && (
                  <span style={{
                    fontFamily: "'Anton',sans-serif", fontSize: 10, color: "rgba(255,255,255,.35)",
                    letterSpacing: 1, marginLeft: 10
                  }}>#{ord.order_number}</span>
                )}
              </div>
              <span style={{
                fontFamily: "'Outfit',sans-serif", fontSize: 11, color: "rgba(255,255,255,.3)", fontWeight: 600
              }}>{timeAgo(ord.created_at)}</span>
            </div>

            {/* Customer name */}
            {ord.user_name && (
              <div style={{
                fontFamily: "'Outfit',sans-serif", fontSize: 12, color: "rgba(255,255,255,.45)",
                fontWeight: 600, marginBottom: 6
              }}>{ord.user_name}</div>
            )}

            {/* Items list */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,.06)", paddingTop: 6, marginBottom: 6 }}>
              {(ord.items || []).map((it, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between",
                  fontFamily: "'Outfit',sans-serif", fontSize: 12, color: "rgba(255,255,255,.6)",
                  fontWeight: 500, padding: "2px 0"
                }}>
                  <span>
                    <span style={{ fontFamily: "'Anton',sans-serif", color: "rgba(255,255,255,.4)", marginRight: 6 }}>
                      {it.qty}×
                    </span>
                    {it.name}
                  </span>
                  <span style={{ color: "rgba(255,255,255,.3)", flexShrink: 0, marginLeft: 8 }}>
                    ${(it.price * it.qty).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            {/* Total + payment */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{
                fontFamily: "'Anton',sans-serif", fontSize: 16, color: "#fff"
              }}>${(+ord.total).toFixed(2)}</span>
              <span style={{
                fontFamily: "'Anton',sans-serif", fontSize: 9, letterSpacing: 2,
                color: "rgba(255,255,255,.3)", background: "rgba(255,255,255,.05)",
                padding: "3px 7px", border: "1px solid rgba(255,255,255,.08)"
              }}>{payLabel(ord.payment_method)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── SECTION: AVAILABILITY ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, marginBottom: 14,
        borderTop: "1px solid rgba(255,255,255,.07)", paddingTop: 20
      }}>
        <span style={{
          fontFamily: "'Anton',sans-serif", fontSize: 13, letterSpacing: 3, color: "#fff"
        }}>AVAILABILITY</span>
      </div>

      {menuItems.length === 0 && (
        <div style={{
          padding: "28px 0", textAlign: "center",
          fontFamily: "'Outfit',sans-serif", fontSize: 13, color: "rgba(255,255,255,.2)"
        }}>No menu items</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {Object.entries(grouped).map(([category, items]) => (
          <div key={category}>
            {/* Category header */}
            <div style={{
              fontFamily: "'Anton',sans-serif", fontSize: 9, letterSpacing: 3,
              color: "rgba(255,255,255,.3)", marginBottom: 8
            }}>{category.toUpperCase()}</div>

            <div style={{
              background: "rgba(255,255,255,.03)",
              border: "1px solid rgba(255,255,255,.08)",
            }}>
              {items.map((item, i) => (
                <div key={item.id || item.name} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 14px",
                  borderBottom: i < items.length - 1 ? "1px solid rgba(255,255,255,.05)" : "none",
                }}>
                  <span style={{
                    fontFamily: "'Outfit',sans-serif", fontSize: 13, fontWeight: 600,
                    color: item.sold_out ? "rgba(255,255,255,.3)" : "rgba(255,255,255,.8)",
                    textDecoration: item.sold_out ? "line-through" : "none",
                  }}>{item.name}</span>

                  <button
                    onClick={() => onToggleSoldOut(item)}
                    style={{
                      fontFamily: "'Anton',sans-serif", fontSize: 9, letterSpacing: 2,
                      padding: "6px 12px", cursor: "pointer", border: "none",
                      flexShrink: 0, marginLeft: 12,
                      background: item.sold_out ? "rgba(248,113,113,.15)" : "rgba(74,222,128,.15)",
                      color: item.sold_out ? "#f87171" : "#4ade80",
                      outline: `1px solid ${item.sold_out ? "rgba(248,113,113,.35)" : "rgba(74,222,128,.35)"}`,
                      transition: "all .15s",
                    }}
                  >{item.sold_out ? "SOLD OUT" : "IN STOCK"}</button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { printReceipt, AdminHistory, AdminReport, FloorPlan, OrderFeed };
