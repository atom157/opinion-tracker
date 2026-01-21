const { useState, useEffect, useMemo, useRef } = React;

function OpinionPortfolioTracker() {
  const [walletAddress, setWalletAddress] = useState("");
  const [inputAddress, setInputAddress] = useState("");
  const [positions, setPositions] = useState([]);
  const [trades, setTrades] = useState([]);
  const [markets, setMarkets] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [stats, setStats] = useState({
    totalValue: 0,
    totalPnL: 0,
    winRate: 0,
    activePositions: 0,
    totalTrades: 0,
  });

  // Chart canvas refs
  const volumeChartRef = useRef(null);
  const sideChartRef = useRef(null);
  const categoryChartRef = useRef(null);
  // Keep Chart.js instances to destroy/recreate cleanly
  const chartsRef = useRef({});


  const isValidEvmAddress = (a) => /^0x[a-fA-F0-9]{40}$/.test(a);

  const toNum = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };

  const fetchMarketDetails = async (posList) => {
    const ids = [...new Set(posList.map((p) => p.marketId).filter(Boolean))];
    if (!ids.length) return;

    const marketDetails = {};
    // щоб не душити API
    for (const id of ids.slice(0, 20)) {
      try {
        const r = await fetch(`/api/market?id=${id}`);
        if (!r.ok) continue;
        const d = await r.json();
        if ((d.errno === 0 || d.code === 0) && d.result) {
          marketDetails[id] = d.result;
        }
      } catch (e) {}
    }
    setMarkets(marketDetails);
  };

  const calculateStats = (posList, tradesList) => {
    // Positions: беремо те, що реально приходить з API:
    // currentValueInQuoteToken (USDT), unrealizedPnl, sharesOwned, avgEntryPrice
    const totalValue = posList.reduce(
      (s, p) => s + toNum(p.currentValueInQuoteToken),
      0
    );
    const totalPnL = posList.reduce((s, p) => s + toNum(p.unrealizedPnl), 0);

    // Trades: структура може відрізнятись — рахуємо winrate тільки якщо є pnl
    let wins = 0,
      losses = 0;
    for (const t of tradesList) {
      const pnl =
        toNum(t.pnl) ||
        toNum(t.realizedPnl) ||
        toNum(t.realized_pnl) ||
        0;
      if (pnl > 0) wins++;
      else if (pnl < 0) losses++;
    }
    const completed = wins + losses;

    setStats({
      totalValue,
      totalPnL,
      winRate: completed > 0 ? (wins / completed) * 100 : 0,
      activePositions: posList.length,
      totalTrades: tradesList.length,
    });
  };

  const fetchData = async (addressRaw) => {
    const address = (addressRaw || "").trim();

    if (!isValidEvmAddress(address)) {
      setError("Будь ласка, введіть валідну EVM адресу (0x…40 символів)");
      setSuccess("");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      // Positions
      const posResponse = await fetch(
        `/api/positions?address=${encodeURIComponent(address)}&limit=50`
      );
      if (!posResponse.ok) {
        throw new Error(
          `Помилка позицій: ${posResponse.status} ${posResponse.statusText}`
        );
      }
      const posData = await posResponse.json();

      const posOk =
        (posData.errno === 0 || posData.code === 0) && posData.result;
      const posList = posOk ? posData.result.list || [] : [];

      // Trades
      const tradesResponse = await fetch(
        `/api/trades?address=${encodeURIComponent(address)}&limit=100`
      );
      if (!tradesResponse.ok) {
        // трейди можуть бути недоступні — не валимо весь дашборд
        console.warn("Trades request failed:", tradesResponse.status);
      }
      let tradesData = null;
      try {
        tradesData = await tradesResponse.json();
      } catch (e) {}

      const tradesOk =
        tradesData &&
        (tradesData.errno === 0 || tradesData.code === 0) &&
        tradesData.result;
      const tradesList = tradesOk ? tradesData.result.list || [] : [];

      setPositions(posList);
      setTrades(tradesList);
      calculateStats(posList, tradesList);

      if (posList.length) {
        await fetchMarketDetails(posList);
        setSuccess(`✅ Завантажено ${posList.length} позицій`);
      } else {
        setSuccess("✅ Дані завантажено (позицій немає)");
      }

      setWalletAddress(address);
    } catch (err) {
      console.error(err);
      setError(`❌ ${err?.message || "Помилка завантаження даних"}`);
      setPositions([]);
      setTrades([]);
      setMarkets({});
      setStats({
        totalValue: 0,
        totalPnL: 0,
        winRate: 0,
        activePositions: 0,
        totalTrades: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(toNum(value));

  const formatPercent = (value) =>
    `${toNum(value) >= 0 ? "+" : ""}${toNum(value).toFixed(2)}%`;

  
function normalizeTimestamp(ts) {
  const n = Number(ts || 0);
  if (!n) return 0;
  return n < 1e12 ? n * 1000 : n;
}

function buildVolume14d(tradesList) {
  const days = 14;
  const now = new Date();
  const labels = [];
  const buckets = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    buckets[key] = 0;
    labels.push(d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }));
  }
  (tradesList || []).forEach(t => {
    const ts = normalizeTimestamp(t.createdAt || t.timestamp || t.time);
    if (!ts) return;
    const d = new Date(ts);
    const key = d.toISOString().slice(0, 10);
    if (!(key in buckets)) return;
    const size = Math.abs(Number(t.size || t.shares || t.amount || 0));
    const price = Math.abs(Number(t.price || 0));
    const vol = Number(t.volume || (size && price ? size * price : 0)) || 0;
    buckets[key] += vol;
  });
  const values = Object.keys(buckets).sort().map(k => buckets[k]);
  return { labels, values };
}

function buildSideValues(positionsList) {
  const out = { Yes: 0, No: 0 };
  (positionsList || []).forEach(p => {
    const isYes = (p.outcomeSideEnum || p.outcome || '').toString().toLowerCase().includes('yes');
    const side = isYes ? 'Yes' : 'No';
    const v = Number(p.currentValueInQuoteToken || 0);
    out[side] += v;
  });
  return out;
}

function buildCategoryValues(positionsList) {
  const map = {};
  (positionsList || []).forEach(p => {
    const key = (p.rootMarketTitle && p.rootMarketTitle.trim()) ? p.rootMarketTitle.trim() : (p.marketTitle || 'Unknown');
    map[key] = (map[key] || 0) + Number(p.currentValueInQuoteToken || 0);
  });
  const entries = Object.entries(map).sort((a,b)=>b[1]-a[1]);
  const top = entries.slice(0, 6);
  const rest = entries.slice(6);
  if (rest.length) top.push(['Other', rest.reduce((s,[,v])=>s+v,0)]);
  return top;
}

function destroyChart(key) {
  const c = chartsRef.current[key];
  if (c && typeof c.destroy === 'function') {
    try { c.destroy(); } catch (_) {}
  }
  chartsRef.current[key] = null;
}

function buildAnalyticsCharts() {
  if (!window.Chart) return;

  const vol = buildVolume14d(trades);
  destroyChart('volume');
  if (volumeChartRef.current) {
    chartsRef.current.volume = new window.Chart(volumeChartRef.current, {
      type: 'line',
      data: {
        labels: vol.labels,
        datasets: [{
          label: 'Volume (USDT)',
          data: vol.values,
          tension: 0.35,
          fill: true
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: '#D9D9D9' } } },
        scales: {
          x: { ticks: { color: '#AFAFAF' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#AFAFAF' }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }

  const sides = buildSideValues(positions);
  destroyChart('side');
  if (sideChartRef.current) {
    chartsRef.current.side = new window.Chart(sideChartRef.current, {
      type: 'doughnut',
      data: { labels: ['Yes', 'No'], datasets: [{ data: [sides.Yes, sides.No] }] },
      options: { responsive: true, plugins: { legend: { labels: { color: '#D9D9D9' } } } }
    });
  }

  const cats = buildCategoryValues(positions);
  destroyChart('category');
  if (categoryChartRef.current) {
    chartsRef.current.category = new window.Chart(categoryChartRef.current, {
      type: 'bar',
      data: { labels: cats.map(([k]) => k), datasets: [{ label: 'Position Value (USDT)', data: cats.map(([,v]) => v) }] },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: { legend: { labels: { color: '#D9D9D9' } } },
        scales: {
          x: { ticks: { color: '#AFAFAF' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#AFAFAF' }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }
}

React.useEffect(() => {
  buildAnalyticsCharts();
  return () => {
    destroyChart('volume');
    destroyChart('side');
    destroyChart('category');
  };
}, [positions, trades]);

return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="bg-gradient-to-br from-orange-500 to-orange-600 p-3 rounded-xl shadow-lg shadow-orange-500/50">
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <circle cx="12" cy="12" r="10" strokeWidth="2" />
                <circle cx="12" cy="12" r="6" strokeWidth="2" />
                <circle cx="12" cy="12" r="2" strokeWidth="2" />
              </svg>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent">
              Opinion Portfolio Tracker
            </h1>
          </div>
          <p className="text-orange-200/80">
            Track your portfolio on Opinion Protocol
          </p>
          <p className="text-gray-400 text-sm mt-2">BNB Chain • Real-time Data</p>
        </div>

        {/* Wallet Input */}
        <div className="bg-gradient-to-br from-gray-900 to-black backdrop-blur-lg rounded-2xl p-6 mb-8 border border-orange-500/30 shadow-xl shadow-orange-500/10">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <svg
                className="absolute left-4 top-1/2 transform -translate-y-1/2 text-orange-400 w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <rect x="2" y="4" width="20" height="16" rx="2" strokeWidth="2" />
                <path d="M2 10h20" strokeWidth="2" />
              </svg>
              <input
                type="text"
                value={inputAddress}
                onChange={(e) => setInputAddress(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") fetchData(inputAddress);
                }}
                placeholder="Enter wallet address (0x...)"
                className="w-full pl-12 pr-4 py-3 bg-black/50 border border-orange-500/50 rounded-xl text-white placeholder-orange-300/50 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                spellCheck="false"
                autoCapitalize="off"
                autoCorrect="off"
              />
            </div>
            <button
              onClick={() => fetchData(inputAddress)}
              disabled={loading}
              className="px-8 py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:from-gray-600 disabled:to-gray-700 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-500/50 disabled:shadow-none"
            >
              {loading ? (
                <>
                  <svg
                    className="w-5 h-5 animate-spin"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M21 12a9 9 0 11-6.219-8.56"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                  Loading...
                </>
              ) : (
                <>
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <polyline
                      points="22 12 18 12 15 21 9 3 6 12 2 12"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  View Portfolio
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
              <svg
                className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <circle cx="12" cy="12" r="10" strokeWidth="2" />
                <line
                  x1="12"
                  y1="8"
                  x2="12"
                  y2="12"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <circle cx="12" cy="16" r="0.5" fill="currentColor" strokeWidth="1" />
              </svg>
              <span className="text-red-300">{error}</span>
            </div>
          )}

          {success && !error && (
            <div className="mt-4 p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-start gap-3">
              <svg
                className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <circle cx="12" cy="12" r="10" strokeWidth="2" />
                <polyline
                  points="9 12 11 14 15 10"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-green-300">{success}</span>
            </div>
          )}
        </div>

        {walletAddress && !loading && (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-6 text-white shadow-xl shadow-orange-500/30">
                <div className="flex items-center justify-between mb-2">
                  <svg className="w-8 h-8 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <line x1="12" y1="2" x2="12" y2="22" strokeWidth="2" strokeLinecap="round" />
                    <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <span className="text-sm opacity-80">Total Value</span>
                </div>
                <div className="text-3xl font-bold">{formatCurrency(stats.totalValue)}</div>
                <div className="text-sm opacity-70 mt-1">{stats.activePositions} позицій</div>
              </div>

              <div
                className={`bg-gradient-to-br ${
                  stats.totalPnL >= 0 ? "from-green-500 to-green-600" : "from-red-500 to-red-600"
                } rounded-2xl p-6 text-white shadow-xl`}
              >
                <div className="flex items-center justify-between mb-2">
                  <svg className="w-8 h-8 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <polyline
                      points={stats.totalPnL >= 0 ? "23 6 13.5 15.5 8.5 10.5 1 18" : "23 18 13.5 8.5 8.5 13.5 1 6"}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <polyline
                      points={stats.totalPnL >= 0 ? "17 6 23 6 23 12" : "17 18 23 18 23 12"}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="text-sm opacity-80">Total PnL</span>
                </div>
                <div className="text-3xl font-bold">{formatCurrency(stats.totalPnL)}</div>
                <div className="text-sm opacity-70 mt-1">
                  {formatPercent(stats.totalValue > 0 ? (stats.totalPnL / stats.totalValue) * 100 : 0)}
                </div>
              </div>

              <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-6 text-white shadow-xl">
                <div className="flex items-center justify-between mb-2">
                  <svg className="w-8 h-8 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" strokeWidth="2" />
                    <circle cx="12" cy="12" r="6" strokeWidth="2" />
                    <circle cx="12" cy="12" r="2" strokeWidth="2" />
                  </svg>
                  <span className="text-sm opacity-80">Win Rate</span>
                </div>
                <div className="text-3xl font-bold">{stats.winRate.toFixed(1)}%</div>
                <div className="text-sm opacity-70 mt-1">Performance</div>
              </div>

              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white shadow-xl">
                <div className="flex items-center justify-between mb-2">
                  <svg className="w-8 h-8 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-sm opacity-80">Total Trades</span>
                </div>
                <div className="text-3xl font-bold">{stats.totalTrades}</div>
                <div className="text-sm opacity-70 mt-1">trades</div>
              </div>
            </div>

            {/* Positions Table */}
            <div className="bg-gradient-to-br from-gray-900 to-black rounded-2xl p-6 border border-orange-500/20 shadow-xl mb-8">
              <h3 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                <svg className="w-6 h-6 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Positions
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-orange-500/20">
                      <th className="text-left py-3 px-4 text-orange-200 font-semibold">Market</th>
                      <th className="text-right py-3 px-4 text-orange-200 font-semibold">Shares</th>
                      <th className="text-right py-3 px-4 text-orange-200 font-semibold">Avg entry</th>
                      <th className="text-right py-3 px-4 text-orange-200 font-semibold">Value</th>
                      <th className="text-right py-3 px-4 text-orange-200 font-semibold">Unrealized PnL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="text-center py-8 text-gray-400">
                          Немає позицій
                        </td>
                      </tr>
                    ) : (
                      positions.map((pos, idx) => {
                        const shares = toNum(pos.sharesOwned);
                        const avgEntry = toNum(pos.avgEntryPrice);
                        const value = toNum(pos.currentValueInQuoteToken);
                        const pnl = toNum(pos.unrealizedPnl);
                        const pnlPct = toNum(pos.unrealizedPnlPercent) * 100;

                        const market = markets[pos.marketId];
                        const marketTitle =
                          market?.marketTitle || pos.marketTitle || `Market #${pos.marketId}`;

                        return (
                          <tr key={idx} className="border-b border-orange-500/10 hover:bg-orange-500/5 transition-colors">
                            <td className="py-3 px-4 text-white max-w-xl">
                              <div className="truncate">{marketTitle}</div>
                              <div className="text-xs text-gray-400 mt-1">
                                {pos.outcomeSideEnum || pos.outcome || "—"} • {pos.marketStatusEnum || "—"}
                              </div>
                            </td>
                            <td className="text-right py-3 px-4 text-white">{shares.toFixed(6)}</td>
                            <td className="text-right py-3 px-4 text-white">{avgEntry ? `${avgEntry.toFixed(5)} $` : "—"}</td>
                            <td className="text-right py-3 px-4 text-white font-semibold">{formatCurrency(value)}</td>
                            <td className={`text-right py-3 px-4 font-bold ${pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                              {formatCurrency(pnl)}
                              <div className="text-xs opacity-70">{formatPercent(pnlPct)}</div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Trades Table */}
            <div className="bg-gradient-to-br from-gray-900 to-black rounded-2xl p-6 border border-orange-500/20 shadow-xl">
              <h3 className="text-2xl font-bold text-white mb-4">Recent Trades</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-orange-500/20">
                      <th className="text-left py-3 px-4 text-orange-200 font-semibold">Date</th>
                      <th className="text-left py-3 px-4 text-orange-200 font-semibold">Side</th>
                      <th className="text-right py-3 px-4 text-orange-200 font-semibold">Price</th>
                      <th className="text-right py-3 px-4 text-orange-200 font-semibold">Size</th>
                      <th className="text-right py-3 px-4 text-orange-200 font-semibold">PnL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="text-center py-8 text-gray-400">
                          Немає трейдів (або API недоступний)
                        </td>
                      </tr>
                    ) : (
                      trades.slice(0, 20).map((t, idx) => {
                        const pnl = toNum(t.pnl) || toNum(t.realizedPnl) || 0;
                        const created = t.createdAt || t.created_at || t.time || Date.now();
                        return (
                          <tr key={idx} className="border-b border-orange-500/10 hover:bg-orange-500/5 transition-colors">
                            <td className="py-3 px-4 text-white text-sm">
                              {new Date(created).toLocaleString("uk-UA", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td className="py-3 px-4 text-white text-sm">{t.side || t.type || "—"}</td>
                            <td className="text-right py-3 px-4 text-white">{t.price ? `${toNum(t.price).toFixed(5)} $` : "—"}</td>
                            <td className="text-right py-3 px-4 text-white">{t.size ? toNum(t.size).toFixed(6) : "—"}</td>
                            <td className={`text-right py-3 px-4 font-bold ${pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                              {pnl ? formatCurrency(pnl) : "—"}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Footer */}
        <div className="mt-12 text-center text-gray-400 text-sm space-y-2">
          <p className="text-orange-300/80">Powered by Opinion Protocol Open API • Creator: x.com/atom_157</p>
          <p>Created for Opinion Builders Program</p>
          <p className="text-xs text-gray-500">BNB Chain • Real-time Market Data</p>
        </div>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<OpinionPortfolioTracker />);