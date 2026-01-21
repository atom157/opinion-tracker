/* Opinion Portfolio Tracker (vanilla React + Chart.js) */

const { useEffect, useMemo, useRef, useState } = React;

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function fmtUSD(n, digits=2){
  const x = Number(n);
  if (!isFinite(x)) return "$0.00";
  const abs = Math.abs(x);
  const d = abs >= 1000 ? 0 : digits;
  return x.toLocaleString(undefined, { style:"currency", currency:"USD", minimumFractionDigits:d, maximumFractionDigits:d });
}
function fmtNum(n, digits=6){
  const x = Number(n);
  if (!isFinite(x)) return "0";
  return x.toLocaleString(undefined, { minimumFractionDigits:0, maximumFractionDigits:digits });
}

function normalizeApi(json){
  // Support both {errno, errmsg, result} and {code, msg, data}
  if (!json || typeof json !== "object") return { ok:false, error:"Invalid response" };

  if ("errno" in json){
    return { ok: json.errno === 0, error: json.errmsg || json.error || "Request failed", result: json.result };
  }
  if ("code" in json){
    return { ok: json.code === 0, error: json.msg || json.message || "Request failed", result: json.data || json.result };
  }
  // sometimes plain result
  if ("result" in json) return { ok:true, result: json.result };
  if ("data" in json) return { ok:true, result: json.data };
  return { ok:true, result: json };
}

function safeArr(x){
  if (!x) return [];
  if (Array.isArray(x)) return x;
  if (Array.isArray(x.list)) return x.list;
  return [];
}

function detectTradeUSD(t){
  // try common fields
  const candidates = [
    t.usdAmount, t.amountUsd, t.quoteAmountUsd, t.quoteAmountUSD,
    t.quoteAmount, t.amount, t.size, t.value, t.totalValue, t.total, t.notional,
    t.amountInQuoteToken, t.currentValueInQuoteToken
  ];
  for (const c of candidates){
    const v = Number(c);
    if (isFinite(v) && v !== 0) return Math.abs(v);
  }
  const shares = Number(t.shares || t.sharesOwned || t.amountShares);
  const price = Number(t.price || t.avgPrice || t.avgEntryPrice);
  if (isFinite(shares) && isFinite(price)) return Math.abs(shares * price);
  return 0;
}

function detectTradePnlUSD(t){
  const candidates = [t.pnl, t.profit, t.realizedPnl, t.realizedPnL, t.profitUsd, t.pnlUsd];
  for (const c of candidates){
    const v = Number(c);
    if (isFinite(v) && v !== 0) return v;
  }
  return 0;
}

function parseTsToDateLabel(ts){
  // ts may be seconds or ms, or ISO string
  if (ts == null) return "";
  if (typeof ts === "string" && ts.includes("-")){
    const d = new Date(ts);
    if (!isNaN(d.getTime())) return d.toLocaleDateString(undefined, { month:"short", day:"2-digit" });
  }
  const n = Number(ts);
  if (!isFinite(n)) return "";
  const ms = n > 1e12 ? n : n * 1000;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month:"short", day:"2-digit" });
}

function classifyCategory(title){
  const t = (title || "").toLowerCase();
  if (/(fed|rate|cpi|inflation|gdp|unemployment|treasury|macro|etf|sec)\b/.test(t)) return "Macro";
  if (/(election|president|parliament|vote|trump|biden|zelensky|putin|politic)\b/.test(t)) return "Politics";
  if (/(nba|nfl|mlb|nhl|epl|ucl|world cup|match|game|score|team|goal|champion)\b/.test(t)) return "Sports";
  if (/(btc|eth|sol|bnb|crypto|token|airdrop|fdv|tvl|market cap|binance|coinbase)\b/.test(t)) return "Crypto";
  return "More";
}

function buildChart(ctx, config){
  if (!ctx) return null;
  return new Chart(ctx, config);
}

function OpinionPortfolioTracker(){
  const [address, setAddress] = useState("0xf1168F1A131A510459222bA0680907369090DCE0");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null); // {type:'ok'|'warn', text:''}
  const [positions, setPositions] = useState([]);
  const [trades, setTrades] = useState([]);
  const [marketCache, setMarketCache] = useState({}); // marketId -> market detail

  const volChartRef = useRef(null);
  const sideChartRef = useRef(null);
  const catChartRef = useRef(null);

  const volChartInstance = useRef(null);
  const sideChartInstance = useRef(null);
  const catChartInstance = useRef(null);

  const totals = useMemo(()=>{
    const pos = positions || [];
    const tr = trades || [];

    const netWorth = pos.reduce((a,p)=>a + (Number(p.currentValueInQuoteToken) || 0), 0);
    const unreal = pos.reduce((a,p)=>a + (Number(p.unrealizedPnl) || 0), 0);

    const volume = tr.reduce((a,t)=>a + detectTradeUSD(t), 0);

    const realized = tr.reduce((a,t)=>a + detectTradePnlUSD(t), 0);
    const totalPnl = unreal + realized;

    const wins = tr.filter(t => detectTradePnlUSD(t) > 0).length;
    const losses = tr.filter(t => detectTradePnlUSD(t) < 0).length;
    const wr = (wins + losses) > 0 ? (wins / (wins + losses)) : 0;

    return { netWorth, unreal, realized, totalPnl, volume, tradesCount: tr.length, winRate: wr };
  }, [positions, trades]);

  const chartsData = useMemo(()=>{
    // Volume by day
    const tr = trades || [];
    const byDay = new Map();
    let buy = 0, sell = 0;

    for (const t of tr){
      const dLabel = parseTsToDateLabel(t.createdAt ?? t.createTime ?? t.timestamp ?? t.time ?? t.blockTime ?? t.date);
      const v = detectTradeUSD(t);
      if (dLabel){
        byDay.set(dLabel, (byDay.get(dLabel) || 0) + v);
      }
      const side = (t.sideEnum || t.side || "").toString().toLowerCase();
      if (side.includes("buy")) buy += 1;
      else if (side.includes("sell")) sell += 1;
    }

    // keep last ~14 labels in chronological order if possible
    const labels = Array.from(byDay.keys());
    // Try to sort by actual date parsing
    labels.sort((a,b)=>{
      const da = new Date(a);
      const db = new Date(b);
      if (!isNaN(da.getTime()) && !isNaN(db.getTime())) return da - db;
      return a.localeCompare(b);
    });
    const lastN = labels.slice(-14);
    const vols = lastN.map(k => byDay.get(k) || 0);

    // Category distribution from positions (by value)
    const cat = new Map();
    for (const p of (positions || [])){
      const title = p.rootMarketTitle || p.marketTitle || p.title || "";
      const c = classifyCategory(title);
      const v = Number(p.currentValueInQuoteToken) || 0;
      cat.set(c, (cat.get(c) || 0) + v);
    }
    const catLabels = Array.from(cat.keys());
    const catVals = catLabels.map(k => cat.get(k) || 0);

    return { vol:{labels:lastN, data:vols}, side:{buy,sell}, cat:{labels:catLabels, data:catVals} };
  }, [trades, positions]);

  function destroyCharts(){
    for (const inst of [volChartInstance, sideChartInstance, catChartInstance]){
      if (inst.current){
        inst.current.destroy();
        inst.current = null;
      }
    }
  }

  useEffect(()=>{
    // Build / update charts
    if (!window.Chart) return;

    // Volume chart
    const volCtx = volChartRef.current?.getContext("2d");
    const sideCtx = sideChartRef.current?.getContext("2d");
    const catCtx = catChartRef.current?.getContext("2d");

    // Rebuild always (simple + stable)
    destroyCharts();

    if (volCtx){
      volChartInstance.current = buildChart(volCtx, {
        type: "bar",
        data: {
          labels: chartsData.vol.labels,
          datasets: [{
            label: "Volume (USD)",
            data: chartsData.vol.data,
            borderWidth: 0,
            borderRadius: 8
          }]
        },
        options: {
          responsive:true,
          maintainAspectRatio:false,
          plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:(ctx)=>fmtUSD(ctx.raw) } } },
          scales:{
            x:{ ticks:{ color:"rgba(232,238,252,.7)" }, grid:{ color:"rgba(27,38,58,.35)" } },
            y:{ ticks:{ color:"rgba(232,238,252,.7)", callback:(v)=> (v>=1000?("$"+(v/1000).toFixed(1)+"k"):"$"+v) }, grid:{ color:"rgba(27,38,58,.35)" } }
          }
        }
      });
    }

    if (sideCtx){
      sideChartInstance.current = buildChart(sideCtx, {
        type:"doughnut",
        data:{
          labels:["Buy","Sell"],
          datasets:[{ data:[chartsData.side.buy, chartsData.side.sell], borderWidth:0, hoverOffset:6 }]
        },
        options:{
          responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{ position:"bottom", labels:{ color:"rgba(232,238,252,.8)" } } }
        }
      });
    }

    if (catCtx){
      catChartInstance.current = buildChart(catCtx, {
        type:"doughnut",
        data:{
          labels: chartsData.cat.labels.length ? chartsData.cat.labels : ["No data"],
          datasets:[{ data: chartsData.cat.labels.length ? chartsData.cat.data : [1], borderWidth:0, hoverOffset:6 }]
        },
        options:{
          responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{ position:"bottom", labels:{ color:"rgba(232,238,252,.8)" } },
            tooltip:{ callbacks:{ label:(ctx)=> `${ctx.label}: ${fmtUSD(ctx.raw)}` } }
          }
        }
      });
    }
  }, [chartsData]);

  async function apiGet(url){
    const r = await fetch(url, { headers:{ "Accept":"application/json" } });
    const json = await r.json().catch(()=>null);
    return normalizeApi(json);
  }

  async function loadPortfolio(){
    const a = address.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(a)){
      setNotice({ type:"warn", text:"Please enter a valid EVM address (0x…40 hex chars)." });
      return;
    }

    setLoading(true);
    setNotice(null);

    try{
      const [posRes, tradeRes] = await Promise.all([
        apiGet(`/api/positions?address=${encodeURIComponent(a)}`),
        apiGet(`/api/trades?address=${encodeURIComponent(a)}`)
      ]);

      if (!posRes.ok){
        setPositions([]);
        setNotice({ type:"warn", text:`Positions request failed: ${posRes.error}` });
      } else {
        const list = safeArr(posRes.result);
        setPositions(list);
      }

      if (!tradeRes.ok){
        setTrades([]);
        setNotice({ type:"warn", text:`Trades request failed: ${tradeRes.error}` });
      } else {
        const list = safeArr(tradeRes.result);
        setTrades(list);
      }

      if (posRes.ok && tradeRes.ok){
        const count = safeArr(posRes.result).length;
        setNotice({ type:"ok", text:`Loaded ${count} positions.` });
      }
    } catch (e){
      setNotice({ type:"warn", text:`Unexpected error: ${e?.message || e}` });
    } finally{
      setLoading(false);
    }
  }

  useEffect(()=>{
    loadPortfolio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const positionsTableRows = useMemo(()=>{
    return (positions || []).map((p)=>{
      const shares = Number(p.sharesOwned) || 0;
      const avg = Number(p.avgEntryPrice) || 0;
      const value = Number(p.currentValueInQuoteToken) || 0;
      const upnl = Number(p.unrealizedPnl) || 0;
      const upnlPct = Number(p.unrealizedPnlPercent) || 0;

      const signClass = upnl >= 0 ? "green" : "red";
      const pctText = isFinite(upnlPct) ? `${(upnlPct*100).toFixed(2)}%` : "—";

      const meta = `${p.outcomeSideEnum || p.outcomeSide || ""} • ${p.marketStatusEnum || ""}`.trim();
      const root = (p.rootMarketTitle || "").trim();

      return (
        <tr key={String(p.marketId) + String(p.tokenId || "")}>
          <td>
            <div className="posTitle">{p.marketTitle || p.title || `Market #${p.marketId}`}</div>
            <div className="posMeta">
              <span className="muted">{meta || "—"}</span>
              {root ? <span className="muted"> • {root}</span> : null}
            </div>
          </td>
          <td>{fmtNum(shares, 6)}</td>
          <td>{avg ? `${avg.toFixed(5)} $` : "—"}</td>
          <td>{fmtUSD(value)}</td>
          <td className={signClass}>
            {fmtUSD(upnl)} <span className="tiny">({pctText})</span>
          </td>
        </tr>
      );
    });
  }, [positions]);

  const tradesTableRows = useMemo(()=>{
    const list = trades || [];
    return list.slice(0, 30).map((t, idx)=>{
      const date = parseTsToDateLabel(t.createdAt ?? t.createTime ?? t.timestamp ?? t.time ?? t.blockTime ?? t.date) || "—";
      const side = (t.sideEnum || t.side || "—").toString();
      const price = Number(t.price || t.avgPrice || t.avgEntryPrice);
      const size = detectTradeUSD(t);
      const pnl = detectTradePnlUSD(t);
      const pnlCls = pnl > 0 ? "green" : (pnl < 0 ? "red" : "muted");

      return (
        <tr key={t.id || t.txHash || idx}>
          <td>{date}</td>
          <td>{side}</td>
          <td>{isFinite(price) ? `${price.toFixed(5)} $` : "—"}</td>
          <td>{size ? fmtUSD(size) : "—"}</td>
          <td className={pnlCls}>{pnl ? fmtUSD(pnl) : "—"}</td>
        </tr>
      );
    });
  }, [trades]);

  return (
    <div className="container">
      <div className="hero">
        <div className="brand">
          <div className="logo" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2Z" stroke="rgba(255,122,24,.95)" strokeWidth="2"/>
              <path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" stroke="rgba(255,154,61,.95)" strokeWidth="2"/>
              <path d="M12 10.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6Z" fill="rgba(232,238,252,.92)"/>
            </svg>
          </div>
          <h1 className="title">Opinion Portfolio Tracker</h1>
        </div>
        <p className="subtitle">Track your Opinion Protocol portfolio on BNB Chain with real-time data.</p>
        <p className="subsub">Powered by Opinion Protocol Open API</p>
      </div>

      <div className="panel">
        <div className="row">
          <div className="input" title="Wallet address">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 7h16v12H4V7Z" stroke="rgba(255,122,24,.85)" strokeWidth="2"/>
              <path d="M4 7l2-3h14v3" stroke="rgba(255,154,61,.85)" strokeWidth="2"/>
              <path d="M16 13h4" stroke="rgba(232,238,252,.8)" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <input
              value={address}
              onChange={(e)=>setAddress(e.target.value)}
              placeholder="Enter wallet address (0x...)"
              spellCheck="false"
            />
          </div>
          <button className="btn" onClick={loadPortfolio} disabled={loading}>
            <span aria-hidden="true">↻</span>
            {loading ? "Loading..." : "Refresh portfolio"}
          </button>
        </div>

        {notice ? (
          <div className={`notice ${notice.type === "warn" ? "warn" : ""}`}>
            <span aria-hidden="true">{notice.type === "warn" ? "⚠️" : "✅"}</span>
            <div>{notice.text}</div>
          </div>
        ) : null}
      </div>

      <div className="grid4">
        <div className="kpi">
          <div className="label">Total net worth</div>
          <div className="value">{fmtUSD(totals.netWorth)}</div>
          <div className="sub">{positions.length} positions</div>
        </div>
        <div className="kpi">
          <div className="label">Total PnL (est.)</div>
          <div className={`value ${totals.totalPnl >= 0 ? "green" : "red"}`}>{fmtUSD(totals.totalPnl)}</div>
          <div className="sub">Unrealized + realized (if available)</div>
        </div>
        <div className="kpi">
          <div className="label">Total volume</div>
          <div className="value">{fmtUSD(totals.volume)}</div>
          <div className="sub">{totals.tradesCount} trades</div>
        </div>
        <div className="kpi">
          <div className="label">Win rate</div>
          <div className="value">{(totals.winRate*100).toFixed(1)}%</div>
          <div className="sub">Based on realized trade PnL</div>
        </div>
      </div>

      <div className="section">
        <h2>
          <span className="pill">Charts</span>
          <span className="muted">Quick portfolio signals</span>
        </h2>

        <div className="gridCharts">
          <div className="card">
            <div className="muted" style={{fontSize:12, marginBottom:8}}>Volume (last 14 days)</div>
            <canvas ref={volChartRef}></canvas>
          </div>

          <div style={{display:"grid", gap:14}}>
            <div className="card">
              <div className="muted" style={{fontSize:12, marginBottom:8}}>Trade sides</div>
              <canvas ref={sideChartRef}></canvas>
            </div>
            <div className="card">
              <div className="muted" style={{fontSize:12, marginBottom:8}}>Position value by category</div>
              <canvas ref={catChartRef}></canvas>
            </div>
          </div>
        </div>
      </div>

      <div className="section">
        <h2><span className="pill">Positions</span><span className="muted">Your current positions</span></h2>
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Market</th>
                <th>Shares</th>
                <th>Avg entry</th>
                <th>Value</th>
                <th>Unrealized PnL</th>
              </tr>
            </thead>
            <tbody>
              {positionsTableRows.length ? positionsTableRows : (
                <tr><td colSpan="5" className="muted">No positions found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section">
        <h2><span className="pill">Recent trades</span><span className="muted">Last 30 trades (if available)</span></h2>
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Side</th>
                <th>Price</th>
                <th>Size</th>
                <th>PnL</th>
              </tr>
            </thead>
            <tbody>
              {tradesTableRows.length ? tradesTableRows : (
                <tr><td colSpan="5" className="muted">No trades found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="footer">
        Created for the Opinion Builders Program • <span className="tiny">Black + Orange UI inspired by Opinion</span>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<OpinionPortfolioTracker />);
