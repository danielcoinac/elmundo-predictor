import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";

function printReceipt(ord) {
  const date = new Date(ord.created_at);
  const dateStr = date.toLocaleDateString("en-US",{weekday:"short",year:"numeric",month:"long",day:"numeric"});
  const timeStr = date.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});
  const items = (ord.items || []).map(it => `
    <tr>
      <td style="padding:7px 0;font-size:20px;font-weight:900;line-height:1.2;">${it.qty}× ${it.name.toUpperCase()}</td>
      <td style="padding:7px 0;font-size:12px;font-weight:600;text-align:right;color:#555;vertical-align:bottom;">${(it.price*it.qty).toFixed(2)}</td>
    </tr>`).join("");
  const payLabel = ord.payment_method === "credits" ? "CREDITS" : ord.payment_method === "card" ? "CARD" : ord.payment_method === "sponsor_gift" ? "COMPLIMENTARY" : ord.payment_method?.startsWith("group") ? "GROUP ORDER" : "CASH";

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
      <div class="event">WORLD CUP EVENT 2026</div>
      <div class="loc">KRALENDIJK · BONAIRE · EST. 2009</div>
    </div>

    <div class="meta-row"><span class="meta-lbl">Date</span><span class="meta-val">${dateStr}</span></div>
    <div class="meta-row"><span class="meta-lbl">Time</span><span class="meta-val">${timeStr}</span></div>
    <div class="meta-row"><span class="meta-lbl">Table</span><span class="meta-val">${String(ord.table_number).startsWith("OUT-") ? "ZONE " + String(ord.table_number).replace("OUT-","") : ord.table_number}</span></div>
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

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;opacity:0;";
  document.body.appendChild(iframe);
  iframe.contentDocument.open();
  iframe.contentDocument.write(html);
  iframe.contentDocument.close();
  iframe.contentWindow.onafterprint = () => { try { document.body.removeChild(iframe); } catch(e) {} };
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
const FP_KEY     = 'fp-layout-v3';
const FP_BAR_KEY = 'fp-bar-v3';
const FP_KEY_P2     = 'fp-layout-v3-p2';
const FP_BAR_KEY_P2 = 'fp-bar-v3-p2';
const FP_BAR_DEF = { x:780, y:12, w:120, h:64 };
const FP_BAR_DEF_P2 = { x:660, y:12, w:180, h:56 };
const FP_DEFAULT = [
  { id:1,  x:90,  y:24,  w:90, h:70, shape:"rect"  },
  { id:2,  x:210, y:24,  w:90, h:70, shape:"rect"  },
  { id:3,  x:330, y:24,  w:90, h:70, shape:"rect"  },
  { id:4,  x:12,  y:130, w:96, h:72, shape:"rect"  },
  { id:5,  x:250, y:130, w:90, h:76, shape:"rect"  },
  { id:6,  x:360, y:130, w:90, h:76, shape:"rect"  },
  { id:7,  x:580, y:130, w:90, h:72, shape:"rect"  },
  { id:8,  x:700, y:130, w:90, h:72, shape:"rect"  },
  { id:9,  x:12,  y:256, w:110,h:76, shape:"rect"  },
  { id:10, x:240, y:256, w:92, h:72, shape:"rect"  },
  { id:11, x:352, y:256, w:84, h:72, shape:"rect"  },
  { id:12, x:560, y:256, w:110,h:76, shape:"rect"  },
  { id:13, x:710, y:254, w:76, h:76, shape:"round" },
  { id:14, x:12,  y:368, w:110,h:76, shape:"rect"  },
  { id:15, x:240, y:368, w:88, h:76, shape:"rect"  },
  { id:16, x:348, y:368, w:92, h:80, shape:"rect"  },
  { id:17, x:560, y:368, w:88, h:72, shape:"rect"  },
  { id:18, x:672, y:368, w:88, h:72, shape:"rect"  },
  { id:19, x:12,  y:480, w:72, h:72, shape:"round" },
  { id:20, x:104, y:480, w:72, h:72, shape:"round" },
  { id:21, x:266, y:482, w:82, h:72, shape:"rect"  },
  { id:22, x:366, y:482, w:82, h:72, shape:"rect"  },
  { id:23, x:466, y:482, w:82, h:72, shape:"rect"  },
  { id:24, x:636, y:480, w:72, h:72, shape:"round" },
  { id:25, x:732, y:480, w:72, h:72, shape:"round" },
  { id:26, x:366, y:582, w:72, h:72, shape:"round" },
];

// Preset color swatches for zone color picker
const ZONE_PALETTE = [
  "#ef4444","#f97316","#eab308","#22c55e","#14b8a6",
  "#3b82f6","#a855f7","#ec4899","#f1f5f9","#f59e0b",
  "#84cc16","#06b6d4","#8b5cf6","#f43f5e","#ffffff",
];

// Plan #2 — Outdoor zones with canvas layout (id = zone number)
const FP_DEFAULT_P2 = [
  { id:1, color:"#ef4444", x:60,  y:60,  w:120, h:90,  shape:"rect" },
  { id:2, color:"#f97316", x:210, y:60,  w:120, h:90,  shape:"rect" },
  { id:3, color:"#eab308", x:360, y:60,  w:120, h:90,  shape:"rect" },
  { id:4, color:"#22c55e", x:60,  y:180, w:120, h:90,  shape:"rect" },
  { id:5, color:"#14b8a6", x:210, y:180, w:120, h:90,  shape:"rect" },
  { id:6, color:"#3b82f6", x:360, y:180, w:120, h:90,  shape:"rect" },
  { id:7, color:"#a855f7", x:60,  y:300, w:120, h:90,  shape:"rect" },
  { id:8, color:"#ec4899", x:210, y:300, w:120, h:90,  shape:"rect" },
  { id:9, color:"#f1f5f9", x:360, y:300, w:120, h:90,  shape:"rect" },
];

// Module-level set — survives FloorPlan remounts (tab switches)
const _seenOrderIds = new Set();

function FloorPlan({ allOrders, onLoad, onUpdateStatus, onDeleteOrder, onToast = ()=>{} }) {
  const [activePlan, setActivePlan] = useState(() => {
    const pz = localStorage.getItem("em-printer-zone");
    return pz === "outside" ? "2" : "1";
  });
  const isP2 = activePlan === "2";
  const fpKey    = isP2 ? FP_KEY_P2    : FP_KEY;
  const fpBarKey = isP2 ? FP_BAR_KEY_P2 : FP_BAR_KEY;
  const fpDef    = isP2 ? FP_DEFAULT_P2 : FP_DEFAULT;
  const fpBarDef = isP2 ? FP_BAR_DEF_P2 : FP_BAR_DEF;
  const loadSaved = (key, def) => { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : def; } catch { return def; } };

  const [selectedTable, setSelectedTable] = useState(null);
  const [colorPickerZone, setColorPickerZone] = useState(null); // zone id being recolored
  const [now,       setNow      ] = useState(Date.now());
  const [editMode,  setEditMode ] = useState(false);
  const [fpView,  setFpView ] = useState("live");
  const [showFin, setShowFin] = useState(false);
  const [tables,    setTables   ] = useState(() => loadSaved(FP_KEY, FP_DEFAULT));
  const [savedTbls, setSavedTbls] = useState(() => loadSaved(FP_KEY, FP_DEFAULT));
  const [tablesP2,    setTablesP2   ] = useState(() => loadSaved(FP_KEY_P2, FP_DEFAULT_P2));
  const [savedTblsP2, setSavedTblsP2] = useState(() => loadSaved(FP_KEY_P2, FP_DEFAULT_P2));
  const [dragging,  setDragging ] = useState(null);
  const [resizing,  setResizing ] = useState(null);
  const [editSel,   setEditSel  ] = useState(null);
  const [flashTables, setFlashTables] = useState({}); // tableKey → flash timestamp
  const [fpToasts,    setFpToasts]    = useState([]); // { id, tableKey, label, x, y }
  const seenOrderIds   = { current: _seenOrderIds }; // points to module-level set
  const flashTimersRef = useRef({});
  const [barPos,    setBarPos   ] = useState(() => loadSaved(FP_BAR_KEY, FP_BAR_DEF));
  const [savedBar,  setSavedBar ] = useState(() => loadSaved(FP_BAR_KEY, FP_BAR_DEF));
  const [barPosP2,  setBarPosP2 ] = useState(() => loadSaved(FP_BAR_KEY_P2, FP_BAR_DEF_P2));
  const [savedBarP2,setSavedBarP2] = useState(() => loadSaved(FP_BAR_KEY_P2, FP_BAR_DEF_P2));
  const [barDrag,   setBarDrag  ] = useState(null);
  const [activeGroupSessions, setActiveGroupSessions] = useState([]); // group_orders with status open/ordering/awaiting_payment
  const canvasRef = useRef(null);

  // ── Printer zone routing ────────────────────────────────────────────────
  const PZ_KEY   = "em-printer-zone";  // "inside" | "outside"
  const PZ_SEEN  = "em-printer-seen";  // "1" once ever seen/chosen
  const [printerZone,   setPrinterZone  ] = useState(() => localStorage.getItem(PZ_KEY));
  // Only auto-open if the user has NEVER seen this modal before on this device
  const [showZoneModal, setShowZoneModal] = useState(() =>
    !localStorage.getItem(PZ_KEY) && !localStorage.getItem(PZ_SEEN)
  );

  // Mark as seen as soon as the modal is shown the first time
  useEffect(() => {
    if (showZoneModal) localStorage.setItem(PZ_SEEN, "1");
  }, [showZoneModal]);

  const saveZone = (z) => {
    localStorage.setItem(PZ_KEY, z);
    localStorage.setItem(PZ_SEEN, "1");
    setPrinterZone(z);
    setShowZoneModal(false);
    setActivePlan(z === "outside" ? "2" : "1");
    setEditMode(false);
    setSelectedTable(null);
    setEditSel(null);
  };

  const dismissZoneModal = () => {
    localStorage.setItem(PZ_SEEN, "1");
    setShowZoneModal(false);
  };

  // Plan-aware aliases
  const curTables    = isP2 ? tablesP2    : tables;
  const setCurTables = isP2 ? setTablesP2 : setTables;
  const curBar       = isP2 ? barPosP2    : barPos;
  const setCurBar    = isP2 ? setBarPosP2 : setBarPos;

  const switchPlan = (p) => {
    setActivePlan(p);
    setEditMode(false);
    setSelectedTable(null);
    setEditSel(null);
    setFpView("live");
  };

  // Auto-refresh orders + clock every 10s + auto-cancel stale orders
  useEffect(() => {
    const refresh = async () => {
      await onLoad();
      setNow(Date.now());
      // Fetch active group sessions for table color + countdown
      const { data: gs } = await supabase.from("group_orders")
        .select("id,table_number,status,created_at")
        .in("status", ["open", "ordering", "awaiting_payment"]);
      const loadedSessions = gs || [];
      setActiveGroupSessions(loadedSessions);
      // Auto-expire group orders open > 30 min
      const staleThreshold = Date.now() - 30 * 60 * 1000;
      const staleSessions = loadedSessions.filter(s =>
        s.status === "open" && new Date(s.created_at).getTime() < staleThreshold
      );
      for (const s of staleSessions) {
        await supabase.from("group_orders").update({ status: "cancelled" }).eq("id", s.id);
      }
      const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      // Cancel card_pending orders unpaid for 10+ min
      await supabase.from("orders")
        .update({ status: "cancelled" })
        .eq("status", "pending").eq("payment_method", "card_pending")
        .lt("created_at", cutoff);
      // Cancel group orders stuck in awaiting_payment for 10+ min
      await supabase.from("group_orders")
        .update({ status: "cancelled" })
        .eq("status", "awaiting_payment")
        .lt("created_at", cutoff);
    };
    refresh();
    const iv = setInterval(refresh, 10000);
    return () => clearInterval(iv);
  }, []);

  // Cancel all flash timers on unmount to avoid setState on unmounted component
  useEffect(() => {
    return () => { Object.values(flashTimersRef.current).forEach(clearTimeout); };
  }, []);

  // Detect new orders → flash table green + spawn floating toast
  useEffect(() => {
    if (!allOrders.length) return;
    const FLASH_WINDOW_MS = 20000; // only flash orders placed in the last 20s
    const now = Date.now();
    const newEntries = []; // { key, label, tbl }
    allOrders.forEach(o => {
      if (!seenOrderIds.current.has(o.id)) {
        seenOrderIds.current.add(o.id);
        const age = now - new Date(o.created_at).getTime();
        if (age > FLASH_WINDOW_MS) return; // historical order — seed silently, no flash
        const isOut = String(o.table_number).startsWith("OUT-");
        const key   = String(o.table_number);
        const label = isOut
          ? `🌴 Zone ${key.replace("OUT-","")} ordered!`
          : `🍺 Table ${o.table_number} ordered!`;
        // Find table position for toast placement
        const tbl = (isOut ? tablesP2 : tables).find(t =>
          isOut ? `OUT-${t.id}` === key : String(t.id) === key
        );
        newEntries.push({ key, label, tbl, ord: o });
      }
    });
    if (newEntries.length === 0) return;
    // Print receipt — only print orders that match this device's zone
    newEntries.forEach(({ ord }) => {
      if (!ord) return;
      const zone = localStorage.getItem("em-printer-zone");
      const orderIsOutside = String(ord.table_number).startsWith("OUT-");
      if (zone === "inside"  &&  orderIsOutside) return; // outside order → skip on inside device
      if (zone === "outside" && !orderIsOutside) return; // inside order  → skip on outside device
      try { printReceipt(ord); } catch(e) {}
    });
    const ts = Date.now();
    // Flash + toasts — timers stored in ref so effect cleanup never cancels them
    setFlashTables(prev => {
      const next = { ...prev };
      newEntries.forEach(({ key }) => { next[key] = ts; });
      return next;
    });
    const toastItems = newEntries.map(({ key, label, tbl }) => ({
      id: `${key}-${ts}`,
      label,
      x: tbl ? tbl.x + tbl.w / 2 : 80,
      y: tbl ? tbl.y - 10 : 80,
    }));
    setFpToasts(prev => [...prev, ...toastItems]);
    newEntries.forEach(({ key }) => {
      if (flashTimersRef.current[key]) clearTimeout(flashTimersRef.current[key]);
      flashTimersRef.current[key] = setTimeout(() => {
        setFlashTables(prev => { const n = { ...prev }; if (n[key] === ts) delete n[key]; return n; });
        setFpToasts(prev => prev.filter(t => t.id !== `${key}-${ts}`));
        delete flashTimersRef.current[key];
      }, 3000);
    });
  }, [allOrders]);

  // Financial summary — today only
  const todayStr = new Date().toDateString();
  const todayOrders  = allOrders.filter(o => new Date(o.created_at).toDateString() === todayStr);
  const todayRevenue = todayOrders.reduce((s, o) => s + (+o.total || 0), 0);
  const todayCount   = todayOrders.length;

  // Today's orders per table
  const todayByTable = todayOrders.reduce((acc, o) => {
    const t = String(o.table_number);
    if (!acc[t]) acc[t] = [];
    acc[t].push(o);
    return acc;
  }, {});

  // Active = card_pending Stripe orders (kept for auto-cancel logic only, no color)
  const allActiveOrders = allOrders.filter(o => o.status === "pending" && o.payment_method === "card_pending");
  const activeOrders = allActiveOrders.filter(o => isP2 ? String(o.table_number).startsWith("OUT-") : !String(o.table_number).startsWith("OUT-"));
  const byTable = {}; // not used for display anymore

  // Table status — only group (light blue) or empty/active_today
  const tableStatus = (num) => {
    const key = isP2 ? `OUT-${num}` : String(num);
    const today = todayByTable[key] || [];
    if (activeGroupSessions.some(g => String(g.table_number) === key)) return "group";
    if (today.length > 0) return "active_today";
    return "empty";
  };

  const statusStyle = (s) => ({
    empty:        { bg:"rgba(255,255,255,.04)", border:"rgba(255,255,255,.1)",  color:"rgba(255,255,255,.25)", blink:false },
    active_today: { bg:"rgba(255,255,255,.04)", border:"rgba(255,255,255,.1)",  color:"rgba(255,255,255,.25)", blink:false },
    group:        { bg:"rgba(96,165,250,.15)",  border:"rgba(96,165,250,.8)",   color:"#93c5fd",               blink:false },
  }[s] || { bg:"rgba(255,255,255,.04)", border:"rgba(255,255,255,.1)", color:"rgba(255,255,255,.25)", blink:false });

  const statusColor = s => s==="pending"?"#f59e0b":s==="ready"?"#fff":"rgba(255,255,255,.3)";
  const statusLabel = s => s==="pending"?"NEW ORDER":s==="ready"?"READY":"";

  const pendingCount = activeOrders.filter(o=>o.status==="pending").length;
  const urgentTables = curTables.filter(t => tableStatus(t.id)==="urgent");

  // ── Drag / Resize ──────────────────────────────────────────────────────────
  const getPos = e => e.touches ? { x:e.touches[0].clientX, y:e.touches[0].clientY } : { x:e.clientX, y:e.clientY };

  const startDrag = (e, id) => {
    if (!editMode) return;
    e.stopPropagation(); e.preventDefault();
    const pos = getPos(e);
    const rect = canvasRef.current.getBoundingClientRect();
    const t = curTables.find(t => t.id === id);
    setDragging({ id, ox: pos.x - rect.left - t.x, oy: pos.y - rect.top - t.y });
    setEditSel(id);
  };

  const startResize = (e, id) => {
    e.stopPropagation(); e.preventDefault();
    const pos = getPos(e);
    const t = curTables.find(t => t.id === id);
    setResizing({ id, sx: pos.x, sy: pos.y, sw: t.w, sh: t.h });
  };

  const onMove = (e) => {
    if (!dragging && !resizing && !barDrag) return;
    const pos = getPos(e);
    if (dragging) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width - 30, pos.x - rect.left - dragging.ox));
      const y = Math.max(0, pos.y - rect.top - dragging.oy);
      setCurTables(ts => ts.map(t => t.id === dragging.id ? { ...t, x, y } : t));
    }
    if (resizing) {
      const dx = pos.x - resizing.sx;
      const dy = pos.y - resizing.sy;
      setCurTables(ts => ts.map(t => t.id === resizing.id ? {
        ...t,
        w: Math.max(50, resizing.sw + dx),
        h: t.shape === "round" ? Math.max(50, resizing.sw + dx) : Math.max(40, resizing.sh + dy),
      } : t));
    }
    if (barDrag) {
      const rect = canvasRef.current.getBoundingClientRect();
      setCurBar(b => ({
        ...b,
        x: Math.max(0, Math.min(rect.width - b.w, pos.x - rect.left - barDrag.ox)),
        y: Math.max(0, pos.y - rect.top - barDrag.oy),
      }));
    }
  };

  const onEnd = () => { setDragging(null); setResizing(null); setBarDrag(null); };

  // ── Edit actions ───────────────────────────────────────────────────────────
  const changeZoneColor = (id, color) => {
    setCurTables(ts => ts.map(t => t.id === id ? { ...t, color } : t));
  };

  const addTable = () => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const cx = rect ? Math.max(10, (rect.width / 2) - 60) : 200;
    if (isP2) {
      // Generate a unique zone name
      const used = new Set(curTables.map(t => t.id));
      let newId = 1;
      while (used.has(newId)) newId++;
      if (newId > 99) return;
      const usedColors = new Set(curTables.map(t => t.color));
      const defaultColor = ZONE_PALETTE.find(c => !usedColors.has(c)) || ZONE_PALETTE[0];
      const newT = { id: newId, color: defaultColor, x: cx, y: 80, w: 120, h: 90, shape: "rect" };
      setCurTables(ts => [...ts, newT]);
      setEditSel(newId);
      return;
    }
    const maxId = curTables.length > 0 ? Math.max(...curTables.map(t => +t.id || 0)) : 0;
    const newT = { id: maxId + 1, x: cx, y: 80, w: 72, h: 56, shape: "rect" };
    setCurTables(ts => [...ts, newT]);
    setEditSel(maxId + 1);
  };

  const deleteTable = (id) => {
    setCurTables(ts => ts.filter(t => t.id !== id));
    if (editSel === id) setEditSel(null);
  };

  const toggleShape = (id) => {
    setCurTables(ts => ts.map(t => t.id === id
      ? { ...t, shape: t.shape === "rect" ? "round" : "rect" }
      : t
    ));
  };

  const saveLayout = () => {
    localStorage.setItem(fpKey, JSON.stringify(curTables));
    localStorage.setItem(fpBarKey, JSON.stringify(curBar));
    if (isP2) { setSavedTblsP2(tablesP2); setSavedBarP2(barPosP2); }
    else       { setSavedTbls(tables);     setSavedBar(barPos);     }
    setEditMode(false); setEditSel(null);
  };

  const cancelEdit = () => {
    if (isP2) { setTablesP2(savedTblsP2); setBarPosP2(savedBarP2); }
    else       { setTables(savedTbls);     setBarPos(savedBar);      }
    setEditMode(false); setEditSel(null);
  };

  const resetLayout = () => { setCurTables(fpDef); setCurBar(fpBarDef); setEditSel(null); };

  // ── Canvas dimensions ───────────────────────────────────────────────────────
  const canvasH = Math.max(700, ...curTables.map(t => t.y + t.h + 80));
  const CANVAS_MIN_W = 920;

  // ── Table / Zone element ───────────────────────────────────────────────────
  const TableEl = ({ tbl }) => {
    const isZone = isP2;
    const zoneColor = tbl.color || "#ffffff";
    const s  = editMode ? "empty" : tableStatus(tbl.id);
    const st = statusStyle(s);
    const tableKey = isZone ? `OUT-${tbl.id}` : String(tbl.id);
    const todayTblOrd = editMode ? [] : (todayByTable[tableKey] || []);
    const pCount = 0; // card pending no longer tracked visually
    const todayRev = todayTblOrd.reduce((s, o) => s + (+o.total || 0), 0);
    const hasNote = todayTblOrd.some(o => (o.items || []).some(i => i.note));
    const isGroup = todayTblOrd.some(o => o.payment_method?.startsWith("group"));
    const lastInitial = todayTblOrd.length > 0
      ? (todayTblOrd[todayTblOrd.length - 1].user_name || "?")[0].toUpperCase()
      : null;
    const isSel = editSel === tbl.id;
    const isDraggingThis = dragging?.id === tbl.id;
    const isFlashing = !editMode && !!flashTables[tableKey];

    // Zone (P2) style
    const zoneBg   = editMode ? (isSel ? `${zoneColor}30` : `${zoneColor}18`) : `${zoneColor}22`;
    const zoneBord = editMode ? (isSel ? zoneColor : `${zoneColor}88`) : `${zoneColor}99`;

    return (
      <div
        className={isFlashing ? "fp-flash-green" : (!isZone && !editMode && st.blink ? "fp-blink" : "")}
        style={{
          position:"absolute", left:tbl.x, top:tbl.y, width:tbl.w, height:tbl.h,
          background: isFlashing ? "rgba(74,222,128,.18)" : isZone ? zoneBg : (editMode ? (isSel ? "rgba(255,255,255,.1)" : "rgba(255,255,255,.04)") : st.bg),
          border: isZone
            ? `2px ${editMode && isSel ? "solid" : "solid"} ${zoneBord}`
            : (editMode ? `2px ${isSel?"solid":"dashed"} rgba(255,255,255,${isSel?".65":".2"})` : `2px solid ${st.border}`),
          borderRadius: tbl.shape === "round" ? "50%" : 10,
          cursor: editMode ? (isDraggingThis ? "grabbing" : "grab") : "default",
          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
          transition: isDraggingThis ? "none" : "background .2s, border .2s, box-shadow .2s",
          boxShadow: isZone
            ? (editMode && isSel ? `0 0 0 3px ${zoneColor}44, 0 8px 24px rgba(0,0,0,.5)` : `0 0 14px ${zoneColor}22`)
            : (editMode ? (isSel ? "0 0 0 3px rgba(255,255,255,.2), 0 8px 24px rgba(0,0,0,.6)" : "0 2px 10px rgba(0,0,0,.4)")
              : (st.blink ? `0 0 20px rgba(239,68,68,.5), 0 0 40px rgba(239,68,68,.2), inset 0 0 15px rgba(239,68,68,.1)`
                : s==="group" ? `0 0 14px rgba(96,165,250,.4), 0 0 28px rgba(96,165,250,.15)`
                : s==="card_pending" ? `0 0 12px rgba(251,191,36,.35)`
                : "0 1px 4px rgba(0,0,0,.3)")),
          userSelect:"none", touchAction:"none",
          zIndex: isSel ? 20 : isDraggingThis ? 15 : 1,
        }}
        onMouseDown={e => editMode && startDrag(e, tbl.id)}
        onTouchStart={e => editMode && startDrag(e, tbl.id)}
        onClick={e => editMode && (e.stopPropagation(), setEditSel(tbl.id))}
      >
        {/* Zone color circle + name (P2) */}
        {isZone && (
          <>
            <div style={{width:Math.min(tbl.w*.28, 28),height:Math.min(tbl.w*.28, 28),borderRadius:"50%",background:zoneColor,marginBottom:6,boxShadow:`0 0 10px ${zoneColor}88`,opacity:editMode?0.9:0.85}}/>
            <span style={{fontFamily:"'Anton',sans-serif",fontSize:Math.min(tbl.w*.13, 14),color:zoneColor,letterSpacing:2,lineHeight:1,textAlign:"center"}}>ZONE {tbl.id}</span>
          </>
        )}

        {/* Table number (P1) */}
        {!isZone && (
          <span style={{fontFamily:"'Anton',sans-serif",fontSize:tbl.w>65?20:15,color:editMode?"rgba(255,255,255,.7)":st.color,letterSpacing:.5,lineHeight:1}}>{tbl.id}</span>
        )}

        {/* Group order badge — only when active group session */}
        {!isZone && !editMode && s === "group" && (() => {
          const session = activeGroupSessions.find(g => String(g.table_number) === tableKey);
          const expiresIn = session?.created_at
            ? Math.max(0, 30*60 - Math.floor((Date.now() - new Date(session.created_at).getTime()) / 1000))
            : null;
          const isExpiring = expiresIn !== null && expiresIn < 5 * 60;
          return (
            <div style={{position:"absolute",bottom:5,left:"50%",transform:"translateX(-50%)",background:"rgba(96,165,250,.2)",border:`1px solid ${isExpiring?"rgba(239,68,68,.7)":"rgba(96,165,250,.6)"}`,borderRadius:4,padding:"2px 6px",whiteSpace:"nowrap"}}>
              <span style={{fontFamily:"'Outfit',sans-serif",fontSize:9,fontWeight:700,letterSpacing:1,color:isExpiring?"#f87171":"#93c5fd",textTransform:"uppercase"}}>
                Group{expiresIn !== null ? ` ${Math.floor(expiresIn/60)}:${String(expiresIn%60).padStart(2,"0")}` : ""}
              </span>
            </div>
          );
        })()}


        {/* EDIT: shape toggle (top-left) */}
        {editMode && (
          <div onMouseDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();toggleShape(tbl.id);}}
            style={{position:"absolute",top:-9,left:-9,width:18,height:18,borderRadius:"50%",background:"rgba(96,165,250,.25)",border:"1px solid rgba(96,165,250,.7)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:9,color:"#93c5fd",fontFamily:"'Anton',sans-serif",zIndex:30}}
            title="Toggle shape">
            {tbl.shape==="round"?"□":"○"}
          </div>
        )}

        {/* EDIT: color swatch trigger (P2 zones — top-right) */}
        {isZone && editMode && (
          <div onMouseDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();setColorPickerZone(v=>v===tbl.id?null:tbl.id);}}
            style={{position:"absolute",top:-9,right:-9,width:18,height:18,borderRadius:"50%",cursor:"pointer",border:`2px solid rgba(255,255,255,.6)`,background:zoneColor,zIndex:30}}
            title="Change color"/>
        )}

        {/* EDIT: delete — bottom-left for zones (top-right taken by color), top-right for tables */}
        {editMode && (
          <div onMouseDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();deleteTable(tbl.id);setColorPickerZone(null);}}
            style={{position:"absolute",...(isZone?{bottom:-9,left:-9}:{top:-9,right:-9}),width:18,height:18,borderRadius:"50%",background:"rgba(239,68,68,.25)",border:"1px solid rgba(239,68,68,.7)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:13,color:"#f87171",lineHeight:1,zIndex:30}}>
            ×
          </div>
        )}

        {/* EDIT: resize handle (bottom-right) */}
        {editMode && (
          <div onMouseDown={e=>startResize(e,tbl.id)} onTouchStart={e=>startResize(e,tbl.id)}
            style={{position:"absolute",bottom:-1,right:-1,width:13,height:13,background:isZone?zoneColor:"rgba(255,255,255,.55)",cursor:"se-resize",borderRadius:tbl.shape==="round"?"50%":"0 0 4px 0",zIndex:30,border:"1px solid rgba(255,255,255,.9)"}}
          />
        )}
      </div>
    );
  };

  // ── TABLE DETAIL PANEL ────────────────────────────────────────────────────
  const TableDetail = () => {
    const cardPending = (byTable[selectedTable] || []);
    const todayTbl    = (todayByTable[selectedTable] || []);
    const todayRev    = todayTbl.reduce((s, o) => s + (+o.total || 0), 0);
    const [clearing, setClearing] = useState(false);

    const clearPending = async () => {
      setClearing(true);
      await Promise.all(cardPending.map(o =>
        supabase.from("orders").update({ status: "completed" }).eq("id", o.id)
      ));
      await onLoad();
      setClearing(false);
      setSelectedTable(null);
      onToast("Table cleared ✓");
    };

    return (
      <div className="modal-overlay" onClick={()=>setSelectedTable(null)}>
        <div className="fp-detail-panel" onClick={e=>e.stopPropagation()}>

          {/* Header */}
          <div className="fp-detail-header">
            <div>
              <div className="fp-detail-title">{String(selectedTable).startsWith("OUT-") ? `🌴 ${String(selectedTable).replace("OUT-","")}` : `TABLE ${selectedTable}`}</div>
              <div className="fp-detail-sub">{todayTbl.length} order{todayTbl.length!==1?"s":""} today · ${todayRev.toFixed(2)}</div>
            </div>
            <button onClick={e=>{e.stopPropagation();setSelectedTable(null);}} className="fp-detail-close">✕</button>
          </div>

          {/* Clear pending card payments */}
          {cardPending.length > 0 && (
            <div style={{padding:"10px 16px",background:"rgba(251,191,36,.08)",borderBottom:"1px solid rgba(251,191,36,.2)",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
              <span style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"#fbbf24"}}>{cardPending.length} card payment{cardPending.length>1?"s":""} pending</span>
              <button onClick={clearPending} disabled={clearing} style={{fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:1.5,padding:"6px 14px",border:"1px solid rgba(251,191,36,.5)",background:"rgba(251,191,36,.15)",color:"#fbbf24",cursor:"pointer",borderRadius:6}}>
                {clearing ? "…" : "CLEAR TABLE"}
              </button>
            </div>
          )}

          {/* Orders */}
          <div style={{overflowY:"auto",flex:1,padding:"12px 16px",display:"flex",flexDirection:"column",gap:16}}>
            {todayTbl.length === 0 && (
              <div style={{textAlign:"center",padding:"40px 0",fontFamily:"'Outfit',sans-serif",fontSize:14,color:"rgba(255,255,255,.3)"}}>No orders today</div>
            )}

            {[...todayTbl].reverse().map(ord => {
              const items = ord.items || [];

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
                    {/* All items */}
                    <div style={{padding:"10px 0"}}>
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

                    {/* Total */}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0 6px",borderTop:"1px solid rgba(255,255,255,.06)",marginTop:4}}>
                      <span style={{fontFamily:"'Anton',sans-serif",fontSize:22,color:"#fff"}}>${(+ord.total).toFixed(2)}</span>
                      <span style={{fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:1.5,color:"rgba(255,255,255,.35)"}}>{ord.payment_method === "credits" ? "CREDITS" : ord.payment_method === "card" ? "CARD" : ord.payment_method === "sponsor_gift" ? "GIFT" : ord.payment_method?.startsWith("group") ? "GROUP" : ord.payment_method?.toUpperCase() || "—"}</span>
                    </div>


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
    <div className="fp-root">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="fp-header">

        {/* Current floor label + printer zone badge */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
          {/* Read-only floor indicator — floor follows printer zone, change via printer button */}
          <div style={{
            padding:"8px 16px",fontFamily:"'Anton',sans-serif",fontSize:11,letterSpacing:2,
            background: activePlan==="2" ? "rgba(104,211,145,.12)" : "rgba(99,179,237,.12)",
            color: activePlan==="2" ? "#68d391" : "#63b3ed",
            border:`1px solid ${activePlan==="2" ? "rgba(104,211,145,.3)" : "rgba(99,179,237,.3)"}`,
            borderRadius:4, userSelect:"none",
          }}>
            {activePlan==="2" ? "🌴 FLOOR PLAN #2 · OUTDOOR" : "🏠 FLOOR PLAN #1 · INDOOR"}
          </div>
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:"rgba(255,255,255,.25)",letterSpacing:1}}>
            Change floor via printer →
          </div>
          {/* Printer zone indicator — always visible */}
          <button onClick={()=>setShowZoneModal(true)} style={{
            marginLeft:"auto",display:"flex",alignItems:"center",gap:6,
            padding:"6px 14px",borderRadius:20,cursor:"pointer",
            border:`1.5px solid ${printerZone ? (printerZone==="inside"?"rgba(99,179,237,.55)":"rgba(104,211,145,.55)") : "rgba(240,192,64,.5)"}`,
            background: printerZone ? (printerZone==="inside"?"rgba(99,179,237,.08)":"rgba(104,211,145,.08)") : "rgba(240,192,64,.08)",
            color: printerZone ? (printerZone==="inside"?"#63b3ed":"#68d391") : "#F0C040",
            fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:2,
          }}>
            🖨️ {printerZone ? (printerZone==="inside"?"INSIDE PRINTER":"OUTSIDE PRINTER") : "SET PRINTER ZONE"}
            <span style={{opacity:.5,fontSize:9}}>⚙</span>
          </button>
        </div>

        {/* Printer zone modal */}
        {showZoneModal && (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={dismissZoneModal}>
            <div style={{background:"#111",border:"1px solid rgba(255,255,255,.12)",borderRadius:16,padding:"36px 32px",maxWidth:420,width:"90%",textAlign:"center",position:"relative"}} onClick={e=>e.stopPropagation()}>
              {/* Always-visible close button */}
              <button onClick={dismissZoneModal} style={{position:"absolute",top:12,right:14,background:"none",border:"none",color:"rgba(255,255,255,.3)",fontSize:18,cursor:"pointer",lineHeight:1,padding:4}}>✕</button>
              <div style={{fontSize:36,marginBottom:14}}>🖨️</div>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:16,letterSpacing:3,color:"#fff",marginBottom:8}}>WHICH BAR IS THIS DEVICE?</div>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:"rgba(255,255,255,.35)",marginBottom:28,lineHeight:1.6}}>
                This device will only auto-print receipts for the selected zone.<br/>USB-connected printer routes orders automatically.
              </div>
              <div style={{display:"flex",gap:12}}>
                <button onClick={()=>saveZone("inside")} style={{
                  flex:1,padding:"18px 12px",borderRadius:10,cursor:"pointer",
                  border:`2px solid ${printerZone==="inside"?"#63b3ed":"rgba(99,179,237,.3)"}`,
                  background: printerZone==="inside"?"rgba(99,179,237,.15)":"rgba(99,179,237,.05)",
                  color:"#63b3ed",fontFamily:"'Anton',sans-serif",fontSize:13,letterSpacing:2,
                }}>
                  🏠<br/>INSIDE BAR<br/><span style={{fontSize:10,opacity:.6,letterSpacing:1}}>Tables 1–26</span>
                </button>
                <button onClick={()=>saveZone("outside")} style={{
                  flex:1,padding:"18px 12px",borderRadius:10,cursor:"pointer",
                  border:`2px solid ${printerZone==="outside"?"#68d391":"rgba(104,211,145,.3)"}`,
                  background: printerZone==="outside"?"rgba(104,211,145,.15)":"rgba(104,211,145,.05)",
                  color:"#68d391",fontFamily:"'Anton',sans-serif",fontSize:13,letterSpacing:2,
                }}>
                  🌴<br/>OUTSIDE BAR<br/><span style={{fontSize:10,opacity:.6,letterSpacing:1}}>Outdoor Zones</span>
                </button>
              </div>
              <button onClick={dismissZoneModal} style={{marginTop:16,background:"none",border:"none",color:"rgba(255,255,255,.3)",fontFamily:"'Outfit',sans-serif",fontSize:12,cursor:"pointer",letterSpacing:1}}>
                {printerZone ? "Cancel" : "Skip for now"}
              </button>
            </div>
          </div>
        )}

        {/* Row 1: title + view toggle */}
        <div className="fp-header-row1">
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <span className="fp-title">{isP2 ? "OUTDOOR BAR" : "FLOOR PLAN"}</span>
            {fpView === "live" && (editMode ? (
              <span className="fp-edit-badge">EDIT MODE</span>
            ) : (
              <button onClick={()=>{setEditMode(true);setSelectedTable(null);setFpView("live");}} className="fp-edit-btn">✏ EDIT</button>
            ))}
          </div>
          {/* View toggle pill */}
          <div className="fp-view-toggle">
            {[{id:"live",label:"LIVE"},{id:"history",label:"HISTORY"},{id:"report",label:"REPORT"}].map(v=>(
              <button key={v.id} onClick={()=>{setFpView(v.id);if(v.id!=="live"){setEditMode(false);}}}
                className={`fp-view-btn ${fpView===v.id?"fp-view-btn-on":""}`}>
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: Stats cards — only in LIVE mode */}
        {fpView === "live" && (<>
          <div className="fp-stats-grid">
            {/* Urgent */}
            <div className="fp-stat-card" style={{background:urgentTables.length>0?"rgba(248,113,113,.08)":"rgba(255,255,255,.02)",borderColor:urgentTables.length>0?"rgba(248,113,113,.3)":"rgba(255,255,255,.06)"}}>
              <div className="fp-stat-num" style={{color:urgentTables.length>0?"#f87171":"rgba(255,255,255,.15)",textShadow:urgentTables.length>0?"0 0 20px rgba(248,113,113,.4)":"none"}}>{urgentTables.length}</div>
              <div className="fp-stat-label">URGENT</div>
            </div>
            {/* Pending */}
            <div className="fp-stat-card" style={{background:pendingCount>0?"rgba(251,191,36,.06)":"rgba(255,255,255,.02)",borderColor:pendingCount>0?"rgba(251,191,36,.25)":"rgba(255,255,255,.06)"}}>
              <div className="fp-stat-num" style={{color:pendingCount>0?"#fbbf24":"rgba(255,255,255,.15)",textShadow:pendingCount>0?"0 0 20px rgba(251,191,36,.3)":"none"}}>{pendingCount}</div>
              <div className="fp-stat-label">PENDING</div>
            </div>
            {/* Active */}
            <div className="fp-stat-card" style={{background:activeOrders.length>0?"rgba(74,222,128,.06)":"rgba(255,255,255,.02)",borderColor:activeOrders.length>0?"rgba(74,222,128,.25)":"rgba(255,255,255,.06)"}}>
              <div className="fp-stat-num" style={{color:activeOrders.length>0?"#4ade80":"rgba(255,255,255,.15)",textShadow:activeOrders.length>0?"0 0 20px rgba(74,222,128,.3)":"none"}}>{activeOrders.length}</div>
              <div className="fp-stat-label">ACTIVE</div>
            </div>
            {/* Revenue */}
            <div className="fp-stat-card" style={{background:"rgba(255,255,255,.03)",borderColor:"rgba(255,255,255,.12)",boxShadow:"0 0 20px rgba(255,255,255,.02)"}}>
              <div className="fp-stat-num" style={{color:"#fff",filter:showFin?"none":"blur(10px)",userSelect:showFin?"auto":"none",textShadow:showFin?"0 0 16px rgba(255,255,255,.2)":"none"}}>${todayRevenue.toFixed(0)}</div>
              <div className="fp-stat-label" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                <span>TODAY REV</span>
                <button onClick={()=>setShowFin(v=>!v)} style={{background:"none",border:"none",cursor:"pointer",padding:"1px 2px",lineHeight:1,opacity:.5,fontSize:11}}>{showFin?"👁":"🙈"}</button>
              </div>
            </div>
            {/* Orders */}
            <div className="fp-stat-card" style={{background:"rgba(255,255,255,.02)",borderColor:"rgba(255,255,255,.1)"}}>
              <div className="fp-stat-num" style={{color:"#fff",filter:showFin?"none":"blur(10px)",userSelect:showFin?"auto":"none"}}>{todayCount}</div>
              <div className="fp-stat-label">ORDERS</div>
            </div>
          </div>

        </>)}
      </div>

      {/* ── LIVE VIEW ───────────────────────────────────────────────────────── */}
      {fpView === "live" && (<>
        {/* Edit toolbar */}
        {editMode && (
          <>
          <div className="fp-edit-toolbar">
            <button onClick={addTable} className="fp-toolbar-btn fp-toolbar-btn-add">{isP2 ? "+ ADD ZONE" : "+ ADD TABLE"}</button>
            <button onClick={resetLayout} className="fp-toolbar-btn fp-toolbar-btn-reset">↺ RESET</button>
            <div className="fp-toolbar-hint">{isP2 ? "Drag · □/○ · 🎨 color · ⊿ resize · × delete" : "Drag · □/○ · × delete · ⊿ resize"}</div>
            <button onClick={saveLayout} className="fp-toolbar-btn fp-toolbar-btn-save">✓ SAVE</button>
          </div>
          {/* Color palette popover for selected zone */}
          {isP2 && colorPickerZone !== null && (
            <div style={{padding:"10px 12px",background:"#1a1a1a",borderBottom:"1px solid rgba(255,255,255,.1)",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <span style={{fontFamily:"'Anton',sans-serif",fontSize:10,letterSpacing:2,color:"rgba(255,255,255,.4)",flexShrink:0}}>COLOR ›</span>
              {ZONE_PALETTE.map(c => (
                <div key={c} onClick={()=>{ changeZoneColor(colorPickerZone, c); setColorPickerZone(null); }}
                  style={{width:24,height:24,borderRadius:"50%",background:c,cursor:"pointer",flexShrink:0,
                    border: (curTables.find(t=>t.id===colorPickerZone)?.color===c) ? "2px solid #fff" : "2px solid transparent",
                    boxShadow:`0 0 8px ${c}88`}}/>
              ))}
              <button onClick={()=>setColorPickerZone(null)}
                style={{marginLeft:"auto",background:"none",border:"none",color:"rgba(255,255,255,.3)",cursor:"pointer",fontSize:16,padding:"0 4px"}}>✕</button>
            </div>
          )}
          </>
        )}
        {/* Canvas — shared for both plans */}
        <div className="fp-canvas-scroll">
          <div
            ref={canvasRef}
            className="fp-canvas"
            style={{
              minWidth:CANVAS_MIN_W, height:canvasH,
              background: editMode
                ? "radial-gradient(circle, rgba(255,255,255,.06) 1px, transparent 1px) 0 0 / 40px 40px, linear-gradient(180deg, #0e0e0e 0%, #0a0a0a 100%)"
                : "radial-gradient(circle, rgba(255,255,255,.025) 0.8px, transparent 0.8px) 0 0 / 40px 40px, linear-gradient(180deg, rgba(255,255,255,.015) 0%, transparent 50%), #080808",
            }}
            onMouseMove={onMove} onMouseUp={onEnd} onMouseLeave={onEnd}
            onTouchMove={onMove} onTouchEnd={onEnd}
            onClick={()=>{ if(editMode) setEditSel(null); }}
          >
            {/* BAR */}
            <div
              className="fp-bar"
              style={{
                left:curBar.x, top:curBar.y, width:curBar.w, height:curBar.h,
                border: editMode ? `2px dashed rgba(255,255,255,.5)` : "1.5px solid rgba(107,58,31,.7)",
                cursor: editMode ? (barDrag ? "grabbing" : "grab") : "default",
                boxShadow: editMode ? "0 2px 12px rgba(0,0,0,.6)" : "inset 0 1px 0 rgba(255,255,255,.06), 0 4px 16px rgba(0,0,0,.5), 0 0 0 1px rgba(107,58,31,.3)",
                transition: barDrag ? "none" : "border .2s",
                zIndex: barDrag ? 20 : 2,
              }}
              onMouseDown={e => { if (!editMode) return; e.stopPropagation(); const pos = getPos(e); const rect = canvasRef.current.getBoundingClientRect(); setBarDrag({ ox: pos.x - rect.left - curBar.x, oy: pos.y - rect.top - curBar.y }); }}
              onTouchStart={e => { if (!editMode) return; e.stopPropagation(); const pos = getPos(e); const rect = canvasRef.current.getBoundingClientRect(); setBarDrag({ ox: pos.x - rect.left - curBar.x, oy: pos.y - rect.top - curBar.y }); }}
            >
              <span className="fp-bar-label">{isP2 ? "OUTDOOR BAR" : "BAR"}</span>
              {editMode && (
                <div
                  onMouseDown={e => { e.stopPropagation(); const startX = e.clientX; const startY = e.clientY; const startW = curBar.w; const startH = curBar.h;
                    const onMove = e => setCurBar(b => ({ ...b, w: Math.max(40, startW + e.clientX - startX), h: Math.max(30, startH + e.clientY - startY) }));
                    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
                    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp); }}
                  style={{position:"absolute",bottom:-1,right:-1,width:14,height:14,background:"rgba(255,255,255,.6)",cursor:"se-resize",borderRadius:"0 0 4px 0",zIndex:30,border:"1px solid rgba(255,255,255,.9)"}}
                />
              )}
            </div>
            {/* Stairs (Plan 1 only) */}
            {!isP2 && (
              <div className="fp-stairs">
                <div className="fp-stairs-line"/>
                <span className="fp-stairs-label">▼  STAIRS  ▼</span>
                <div className="fp-stairs-line"/>
              </div>
            )}
            {/* Tables / Zones */}
            {curTables.map(t => <TableEl key={t.id} tbl={t} />)}

            {/* Floating toasts */}
            {fpToasts.map(t => (
              <div key={t.id} className="fp-toast" style={{left: t.x, top: t.y}}>
                {t.label}
              </div>
            ))}
          </div>
        </div>
        {/* Detail panel */}

        {/* ── PENDING ITEMS SUMMARY ── */}
        {!editMode && (() => {
          const pendingItems = {};
          activeOrders.filter(o => o.status === "pending").forEach(o => {
            (o.items || []).forEach(it => {
              const key = it.name;
              if (!pendingItems[key]) pendingItems[key] = { name: it.name, qty: 0 };
              pendingItems[key].qty += it.qty;
            });
          });
          const sorted = Object.values(pendingItems).sort((a, b) => b.qty - a.qty);
          if (sorted.length === 0) return null;
          return (
            <div className="fp-pending-wrap">
              <div className="fp-pending-header">
                <span>PENDING ITEMS</span>
                <span className="fp-pending-total">{sorted.reduce((s,i)=>s+i.qty,0)} total</span>
              </div>
              <div className="fp-pending-items">
                {sorted.map(it => (
                  <div key={it.name} className="fp-pending-item">
                    <span className="fp-pending-qty">{it.qty}</span>
                    <span className="fp-pending-name">{it.name}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </>)}

      {/* ── HISTORY VIEW ────────────────────────────────────────────────────── */}
      {fpView === "history" && <AdminHistory allOrders={allOrders} />}

      {/* ── REPORT VIEW ─────────────────────────────────────────────────────── */}
      {fpView === "report" && <AdminReport allOrders={allOrders} />}
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
