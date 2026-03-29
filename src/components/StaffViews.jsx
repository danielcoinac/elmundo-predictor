import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { FOOD_CATS } from "../lib/utils";

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
function KitchenView({ user, onToast = ()=>{} }) {
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
      .neq("status", "cancelled")
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
    const { error } = await supabase.from("orders").update({ kitchen_status:"food_ready" }).eq("id", orderId);
    if (error) { onToast("Failed to update — check connection", false); setMarkingId(null); return; }
    setOrders(prev => prev.map(o => o.id===orderId ? {...o, kitchen_status:"food_ready"} : o));
    setMarkingId(null);
  };

  const dismiss = async (orderId) => {
    const { error } = await supabase.from("orders").update({ kitchen_status:"food_done" }).eq("id", orderId);
    if (error) { onToast("Failed to dismiss — check connection", false); return; }
    setOrders(prev => prev.filter(o => o.id !== orderId));
  };

  // Timer helpers — color + label based on elapsed minutes
  const getMins = (createdAt) => Math.floor((now - new Date(createdAt).getTime()) / 60000);
  const timerColor = (mins) => mins < 5 ? "#4ade80" : mins < 10 ? "#fbbf24" : "#f87171";
  const timerLabel = (mins) => mins < 1 ? "<1m" : `${mins}m`;

  // Sort rush orders first, then by created_at (oldest first)
  const sortKds = (a,b) => (b.is_rush?1:0) - (a.is_rush?1:0) || new Date(a.created_at) - new Date(b.created_at);
  const pending = orders.filter(o => o.kitchen_status === "food_pending").sort(sortKds);
  const ready   = orders.filter(o => o.kitchen_status === "food_ready").sort(sortKds);

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
                      <div style={{display:"flex",alignItems:"baseline",gap:6}}>
                        <div className="kds2-ticket-table">T{order.table_number}</div>
                        {order.order_number && <span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.3)",fontWeight:700}}>#{order.order_number}</span>}
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        {order.is_rush && <span style={{fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:1.5,color:"#f59e0b",background:"rgba(245,158,11,.15)",border:"1px solid rgba(245,158,11,.5)",padding:"2px 7px",animation:"kds-urgent-blink 1s ease-in-out infinite"}}>⚡ RUSH</span>}
                        <div className="kds2-ticket-timer" style={{color: col, borderColor: col}}>
                          {timerLabel(mins)}
                        </div>
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
                      <div style={{display:"flex",alignItems:"baseline",gap:6}}>
                        <div className="kds2-ticket-table" style={{color:"#4ade80"}}>T{order.table_number}</div>
                        {order.order_number && <span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.25)",fontWeight:700}}>#{order.order_number}</span>}
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        {order.is_rush && <span style={{fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:1.5,color:"#f59e0b",background:"rgba(245,158,11,.15)",border:"1px solid rgba(245,158,11,.5)",padding:"2px 7px"}}>⚡</span>}
                        <div className="kds2-ticket-ready-badge">READY ✓</div>
                      </div>
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

function FloorPlan({ allOrders, onLoad, onUpdateStatus, onDeleteOrder, onToast = ()=>{} }) {
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

  // Shared completion check — used by both TableDetail and notification panel
  // Receipt is NOT printed here — it's printed on first confirm action in doUpdate
  const completeIfDone = async (ordId) => {
    const { data: fresh } = await supabase.from("orders").select("*").eq("id", ordId).maybeSingle();
    if (!fresh) return;
    const dDone = (fresh.items||[]).filter(i=>!FOOD_CATS.has(i.category)).length === 0 || fresh.drink_status === "ready";
    const fDone = (fresh.items||[]).filter(i=> FOOD_CATS.has(i.category)).length === 0 || fresh.kitchen_status === "food_done";
    if (dDone && fDone) {
      await supabase.from("orders").update({ status: "completed" }).eq("id", ordId);
      onToast("Order #" + (fresh.order_number || ordId.slice(0,6)) + " completed ✓");
    }
  };

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
          borderRadius: tbl.shape === "round" ? "50%" : 8,
          cursor: editMode ? (isDraggingThis ? "grabbing" : "grab") : (s!=="empty"?"pointer":"default"),
          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
          transition: isDraggingThis ? "none" : "background .2s, border .2s, box-shadow .2s",
          boxShadow: editMode
            ? (isSel ? "0 0 0 3px rgba(255,255,255,.2), 0 8px 24px rgba(0,0,0,.6)" : "0 2px 10px rgba(0,0,0,.4)")
            : (st.blink ? `0 0 20px rgba(239,68,68,.5), 0 0 40px rgba(239,68,68,.2), inset 0 0 15px rgba(239,68,68,.1)` : s==="ready" ? `0 0 16px rgba(255,255,255,.2), 0 0 35px rgba(255,255,255,.08), inset 0 0 12px rgba(255,255,255,.05)` : s==="new" ? `0 0 14px rgba(34,197,94,.3), 0 0 30px rgba(34,197,94,.1), inset 0 0 10px rgba(34,197,94,.08)` : s==="preparing" ? `0 0 12px rgba(96,165,250,.2), inset 0 0 8px rgba(96,165,250,.05)` : "0 1px 4px rgba(0,0,0,.3)"),
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
    // Receipt prints on FIRST confirm (drinks confirmed or food sent to kitchen), not at end.
    // Auto-complete: when drinks="ready" AND food="food_done" (or no drinks/food) → complete (no receipt — already printed).
    const doUpdate = async (ordId, updates) => {
      setBusy(p => ({...p, [ordId]: true}));
      const ord = orders.find(o => o.id === ordId);
      // If bar is confirming drinks and there's food not yet sent → auto-route food to kitchen
      if (ord && updates.drink_status && fItems(ord).length > 0 && !ord.kitchen_status) {
        updates.kitchen_status = "food_pending";
      }
      // Print receipt on first confirm action (drinks confirmed or food-only sent to kitchen)
      if (ord) {
        const isFirstDrinkConfirm = updates.drink_status === "confirmed" && !ord.drink_status;
        const isFoodOnlySend = updates.kitchen_status === "food_pending" && !updates.drink_status && !ord.kitchen_status;
        if (isFirstDrinkConfirm || isFoodOnlySend) {
          try { printReceipt({ ...ord, table_number: selectedTable }); } catch(e) { console.error("printReceipt error", e); }
        }
      }
      await supabase.from("orders").update(updates).eq("id", ordId);
      // Check completion via shared function (no receipt — already printed on confirm)
      await completeIfDone(ordId);
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
                      {ord.is_rush && <span style={{fontFamily:"'Anton',sans-serif",fontSize:8,letterSpacing:1.5,color:"#f59e0b",background:"rgba(245,158,11,.12)",border:"1px solid rgba(245,158,11,.4)",padding:"2px 6px"}}>⚡ RUSH</span>}
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
                          <div style={{width:"100%",padding:"13px",marginBottom:10,background:"rgba(192,132,252,.06)",border:"1px solid rgba(192,132,252,.2)",fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:2,color:"rgba(192,132,252,.5)",textAlign:"center",boxSizing:"border-box",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                            <span>⏳ KITCHEN PREPARING…</span>
                            <span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,fontWeight:700,color:"rgba(192,132,252,.7)",background:"rgba(192,132,252,.12)",padding:"2px 6px",borderRadius:3}}>{(() => { const m = Math.floor((Date.now() - new Date(ord.created_at).getTime()) / 60000); return m < 1 ? "<1m" : m + "m"; })()}</span>
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

                    {/* Total + actions */}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0 6px",borderTop:"1px solid rgba(255,255,255,.06)",marginTop:4}}>
                      <span style={{fontFamily:"'Anton',sans-serif",fontSize:22,color:"#fff"}}>${(+ord.total).toFixed(2)}</span>
                    </div>
                    {/* Rush + Cancel row */}
                    <div style={{display:"flex",gap:8,paddingBottom:10}}>
                      <button disabled={isBusy} onClick={()=>doUpdate(ord.id,{is_rush:!ord.is_rush})}
                        style={{flex:1,padding:"9px",border:"1px solid",fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:1.5,cursor:isBusy?"not-allowed":"pointer",
                          background:ord.is_rush?"rgba(245,158,11,.12)":"transparent",
                          borderColor:ord.is_rush?"rgba(245,158,11,.5)":"rgba(255,255,255,.1)",
                          color:ord.is_rush?"#f59e0b":"rgba(255,255,255,.35)",
                        }}>
                        {ord.is_rush ? "⚡ RUSH ON" : "⚡ RUSH"}
                      </button>
                      <button disabled={isBusy} onClick={async()=>{
                        if(!window.confirm("Cancel this order? This cannot be undone.")) return;
                        await supabase.from("orders").update({status:"cancelled"}).eq("id",ord.id);
                        await onLoad();
                      }}
                        style={{padding:"9px 14px",border:"1px solid rgba(239,68,68,.3)",background:"transparent",fontFamily:"'Anton',sans-serif",fontSize:9,letterSpacing:1.5,color:"rgba(239,68,68,.6)",cursor:isBusy?"not-allowed":"pointer"}}>
                        ✕ CANCEL
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
      <div style={{background:"linear-gradient(180deg, #111 0%, #0a0a0a 100%)",borderBottom:"1px solid rgba(255,255,255,.06)",padding:"14px 16px 12px"}}>

        {/* Row 1: title + view toggle */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontFamily:"'Anton',sans-serif",fontSize:20,color:"rgba(255,255,255,.85)",letterSpacing:3,lineHeight:1}}>FLOOR PLAN</span>
            {fpView === "live" && (editMode ? (
              <span style={{fontFamily:"'Anton',sans-serif",fontSize:8,letterSpacing:2,color:"#fbbf24",background:"rgba(251,191,36,.08)",border:"1px solid rgba(251,191,36,.35)",padding:"3px 9px",borderRadius:3}}>EDIT MODE</span>
            ) : (
              <button onClick={()=>{setEditMode(true);setSelectedTable(null);setFpView("live");}} style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.12)",color:"rgba(255,255,255,.45)",padding:"5px 11px",fontFamily:"'Anton',sans-serif",fontSize:8,letterSpacing:2,cursor:"pointer",transition:"all .15s",borderRadius:3}}>✏ EDIT</button>
            ))}
          </div>
          {/* View toggle pill */}
          <div style={{display:"flex",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:4,overflow:"hidden"}}>
            {[{id:"live",label:"⬛ LIVE"},{id:"history",label:"📋 HISTORY"},{id:"report",label:"📊 REPORT"}].map(v=>(
              <button key={v.id} onClick={()=>{setFpView(v.id);if(v.id!=="live"){setEditMode(false);}}}
                style={{padding:"7px 13px",background:fpView===v.id?"rgba(255,255,255,.95)":"transparent",color:fpView===v.id?"#000":"rgba(255,255,255,.35)",border:"none",fontFamily:"'Anton',sans-serif",fontSize:8,letterSpacing:2,cursor:"pointer",transition:"all .18s",whiteSpace:"nowrap",borderRadius:fpView===v.id?3:0}}>
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: Stats cards — only in LIVE mode */}
        {fpView === "live" && (<>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:12}}>
            {/* Urgent */}
            <div style={{background:urgentTables.length>0?"rgba(248,113,113,.08)":"rgba(255,255,255,.02)",border:`1px solid ${urgentTables.length>0?"rgba(248,113,113,.25)":"rgba(255,255,255,.06)"}`,borderRadius:6,padding:"12px 8px",textAlign:"center",transition:"all .3s"}}>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:32,color:urgentTables.length>0?"#f87171":"rgba(255,255,255,.15)",lineHeight:1,textShadow:urgentTables.length>0?"0 0 20px rgba(248,113,113,.4)":"none",transition:"all .3s"}}>{urgentTables.length}</div>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:8,letterSpacing:2.5,color:"rgba(255,255,255,.35)",marginTop:6}}>URGENT</div>
            </div>
            {/* Pending */}
            <div style={{background:pendingCount>0?"rgba(251,191,36,.06)":"rgba(255,255,255,.02)",border:`1px solid ${pendingCount>0?"rgba(251,191,36,.2)":"rgba(255,255,255,.06)"}`,borderRadius:6,padding:"12px 8px",textAlign:"center",transition:"all .3s"}}>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:32,color:pendingCount>0?"#fbbf24":"rgba(255,255,255,.15)",lineHeight:1,textShadow:pendingCount>0?"0 0 20px rgba(251,191,36,.3)":"none",transition:"all .3s"}}>{pendingCount}</div>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:8,letterSpacing:2.5,color:"rgba(255,255,255,.35)",marginTop:6}}>PENDING</div>
            </div>
            {/* Active */}
            <div style={{background:activeOrders.length>0?"rgba(74,222,128,.06)":"rgba(255,255,255,.02)",border:`1px solid ${activeOrders.length>0?"rgba(74,222,128,.2)":"rgba(255,255,255,.06)"}`,borderRadius:6,padding:"12px 8px",textAlign:"center",transition:"all .3s"}}>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:32,color:activeOrders.length>0?"#4ade80":"rgba(255,255,255,.15)",lineHeight:1,textShadow:activeOrders.length>0?"0 0 20px rgba(74,222,128,.3)":"none",transition:"all .3s"}}>{activeOrders.length}</div>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:8,letterSpacing:2.5,color:"rgba(255,255,255,.35)",marginTop:6}}>ACTIVE</div>
            </div>
            {/* Revenue */}
            <div style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.06)",borderRadius:6,padding:"12px 8px",textAlign:"center",position:"relative"}}>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:32,color:"rgba(255,255,255,.85)",lineHeight:1,filter:showFin?"none":"blur(10px)",userSelect:showFin?"auto":"none",transition:"filter .25s"}}>${todayRevenue.toFixed(0)}</div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4,marginTop:6}}>
                <span style={{fontFamily:"'Anton',sans-serif",fontSize:8,letterSpacing:2.5,color:"rgba(255,255,255,.35)"}}>TODAY REV</span>
                <button onClick={()=>setShowFin(v=>!v)} style={{background:"none",border:"none",cursor:"pointer",padding:"1px 2px",lineHeight:1,opacity:.4,fontSize:10}}>{showFin?"👁":"🙈"}</button>
              </div>
            </div>
            {/* Orders */}
            <div style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.06)",borderRadius:6,padding:"12px 8px",textAlign:"center"}}>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:32,color:"rgba(255,255,255,.85)",lineHeight:1,filter:showFin?"none":"blur(10px)",userSelect:showFin?"auto":"none",transition:"filter .25s"}}>{todayCount}</div>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:8,letterSpacing:2.5,color:"rgba(255,255,255,.35)",marginTop:6}}>ORDERS</div>
            </div>
          </div>

          {/* Row 3: color legend — pill badges */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {[{color:"#4ade80",label:"NEW ORDER"},{color:"#93c5fd",label:"PREPARING"},{color:"#fff",label:"READY"},{color:"#fbbf24",label:"WAITING 10m+"},{color:"#f87171",label:"URGENT 15m+"}].map(({color,label})=>(
              <div key={label} style={{display:"flex",alignItems:"center",gap:5,background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.06)",borderRadius:20,padding:"4px 10px 4px 8px"}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:color,boxShadow:`0 0 6px ${color}88`,flexShrink:0}}/>
                <span style={{fontFamily:"'Anton',sans-serif",fontSize:8,letterSpacing:1.5,color:"rgba(255,255,255,.45)"}}>{label}</span>
              </div>
            ))}
          </div>
        </>)}
      </div>

      {/* ── FOOD READY — persistent right-side notification panel ─────────── */}
      {foodReadyOrders.length > 0 && (
        <div style={{position:"fixed",top:80,right:0,zIndex:500,display:"flex",flexDirection:"column",gap:8,pointerEvents:"none",maxHeight:"calc(100vh - 100px)",overflowY:"auto",paddingRight:0}}>
          {foodReadyOrders.map((ord,idx) => {
            const foodNames = (ord.items||[]).filter(i=>FOOD_CATS.has(i.category)).map(i=>`${i.qty}× ${i.name}`);
            return (
              <div key={ord.id} style={{
                pointerEvents:"all",
                display:"flex",alignItems:"stretch",
                background:"rgba(10,10,10,.95)",
                backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
                borderLeft:"3px solid #4ade80",
                borderTop:"1px solid rgba(74,222,128,.15)",
                borderBottom:"1px solid rgba(74,222,128,.15)",
                boxShadow:"-8px 0 40px rgba(0,0,0,.6), -2px 0 20px rgba(74,222,128,.15), inset 0 0 0 1px rgba(74,222,128,.05)",
                animation:`fp-notif-slide 0.5s cubic-bezier(.16,1,.3,1) ${idx*0.1}s both`,
                width:300,
                borderRadius:"8px 0 0 8px",
              }}>
                <div style={{padding:"16px 18px",flex:1,minWidth:0}}>
                  {/* Header */}
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:"#4ade80",boxShadow:"0 0 10px #4ade80, 0 0 20px rgba(74,222,128,.3)",animation:"kds-urgent-blink 1.4s ease-in-out infinite"}}/>
                      <span style={{fontFamily:"'Anton',sans-serif",fontSize:18,letterSpacing:2,color:"#fff"}}>TABLE {ord.table_number}</span>
                    </div>
                    <span style={{fontFamily:"'Anton',sans-serif",fontSize:8,letterSpacing:2,color:"#4ade80",background:"rgba(74,222,128,.1)",border:"1px solid rgba(74,222,128,.2)",padding:"3px 8px",borderRadius:3}}>FOOD READY</span>
                  </div>
                  {/* Customer */}
                  <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:"rgba(255,255,255,.35)",fontWeight:600,marginBottom:10,letterSpacing:.3}}>{ord.user_name}</div>
                  {/* Items */}
                  <div style={{borderTop:"1px dashed rgba(255,255,255,.08)",paddingTop:10,marginBottom:14}}>
                    {foodNames.map((n,i)=>(
                      <div key={i} style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:"rgba(255,255,255,.8)",fontWeight:700,lineHeight:1.7}}>{n}</div>
                    ))}
                  </div>
                  {/* Deliver button */}
                  <button
                    onClick={async()=>{
                      await supabase.from("orders").update({kitchen_status:"food_done"}).eq("id",ord.id);
                      await completeIfDone(ord.id);
                      await onLoad();
                    }}
                    style={{width:"100%",padding:"11px 0",background:"#4ade80",border:"none",fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:2.5,color:"#000",cursor:"pointer",transition:"all .15s",borderRadius:4}}
                    onMouseEnter={e=>e.currentTarget.style.opacity=".85"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
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
                ? "radial-gradient(circle, rgba(255,255,255,.06) 1px, transparent 1px) 0 0 / 40px 40px, linear-gradient(180deg, #0e0e0e 0%, #0a0a0a 100%)"
                : "radial-gradient(circle, rgba(255,255,255,.025) 0.8px, transparent 0.8px) 0 0 / 40px 40px, linear-gradient(180deg, rgba(255,255,255,.015) 0%, transparent 50%), #080808",
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
                border: editMode ? `2px dashed rgba(255,255,255,.5)` : "1.5px solid rgba(107,58,31,.7)",
                borderRadius:8,
                cursor: editMode ? (barDrag ? "grabbing" : "grab") : "default",
                userSelect:"none", touchAction:"none",
                boxShadow: editMode ? "0 2px 12px rgba(0,0,0,.6)" : "inset 0 1px 0 rgba(255,255,255,.06), 0 4px 16px rgba(0,0,0,.5), 0 0 0 1px rgba(107,58,31,.3)",
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
              <span style={{padding:"0 18px",fontFamily:"'Anton',sans-serif",fontSize:7,letterSpacing:6,color:"rgba(255,255,255,.15)",whiteSpace:"nowrap",background:"#080808",position:"relative",zIndex:1}}>▼  STAIRS  ▼</span>
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

export { printReceipt, AdminHistory, AdminReport, KitchenView, FloorPlan };
