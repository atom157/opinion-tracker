const { useState } = React;

function OpinionPortfolioTracker() {
    const [walletAddress, setWalletAddress] = useState('');
    const [inputAddress, setInputAddress] = useState('');
    const [positions, setPositions] = useState([]);
    const [trades, setTrades] = useState([]);
    const [markets, setMarkets] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [stats, setStats] = useState({
        totalValue: 0,
        totalPnL: 0,
        winRate: 0,
        activePositions: 0,
        totalTrades: 0
    });

    const fetchData = async (address) => {
        if (!address || address.length < 10) {
            setError('Будь ласка, введіть валідну адресу гаманця');
            return;
        }

        setLoading(true);
        setError('');
        setSuccess('');

        try {
            console.log('Fetching data for address:', address);
            
            // Fetch positions
            const posResponse = await fetch(`/api/positions?address=${address}&limit=50`);
            console.log('Positions response status:', posResponse.status);
            
            if (!posResponse.ok) {
                throw new Error(`Помилка позицій: ${posResponse.status} ${posResponse.statusText}`);
            }
            
            const posData = await posResponse.json();
            console.log('Positions data:', posData);

            // Fetch trades
            const tradesResponse = await fetch(`/api/trades?address=${address}&limit=100`);
            console.log('Trades response status:', tradesResponse.status);
            
            if (!tradesResponse.ok) {
                throw new Error(`Помилка трейдів: ${tradesResponse.status} ${tradesResponse.statusText}`);
            }
            
            const tradesData = await tradesResponse.json();
            console.log('Trades data:', tradesData);

            // Process positions
            if (posData.code === 0 && posData.result) {
                const posList = posData.result.list || [];
                setPositions(posList);
                
                if (posList.length > 0) {
                    await fetchMarketDetails(posList);
                    setSuccess(`✅ Завантажено ${posList.length} позицій`);
                } else {
                    setSuccess('✅ Дані завантажено (немає активних позицій)');
                }
            } else {
                console.warn('No positions found or invalid response:', posData);
                setPositions([]);
            }

            // Process trades
            if (tradesData.code === 0 && tradesData.result) {
                const tradesList = tradesData.result.list || [];
                setTrades(tradesList);
                calculateStats(posData.result?.list || [], tradesList);
                
                if (tradesList.length === 0 && posData.result?.list?.length === 0) {
                    setSuccess('✅ Гаманець знайдено, але немає активності');
                }
            } else {
                console.warn('No trades found or invalid response:', tradesData);
                setTrades([]);
                calculateStats(posData.result?.list || [], []);
            }

            setWalletAddress(address);
        } catch (err) {
            console.error('API Error:', err);
            setError(`❌ ${err.message || 'Помилка завантаження даних'}`);
            setPositions([]);
            setTrades([]);
            setStats({
                totalValue: 0,
                totalPnL: 0,
                winRate: 0,
                activePositions: 0,
                totalTrades: 0
            });
        } finally {
            setLoading(false);
        }
    };

    const fetchMarketDetails = async (positions) => {
        const marketIds = [...new Set(positions.map(p => p.marketId).filter(Boolean))];
        const marketDetails = {};
        
        for (const marketId of marketIds.slice(0, 10)) {
            try {
                const response = await fetch(`/api/market?id=${marketId}`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.code === 0 && data.result) {
                        marketDetails[marketId] = data.result;
                    }
                }
            } catch (err) {
                console.error(`Error fetching market ${marketId}:`, err);
            }
        }
        
        setMarkets(marketDetails);
    };

    const calculateStats = (positions, trades) => {
        let totalValue = 0;
        let totalPnL = 0;
        let wins = 0;
        let losses = 0;

        positions.forEach(pos => {
            const size = parseFloat(pos.size || 0);
            const entryPrice = parseFloat(pos.entryPrice || 0);
            const currentPrice = parseFloat(pos.currentPrice || 0);
            
            totalValue += size * currentPrice;
            totalPnL += size * (currentPrice - entryPrice);
        });

        trades.forEach(trade => {
            const pnl = parseFloat(trade.pnl || 0);
            if (pnl > 0) wins++;
            else if (pnl < 0) losses++;
        });

        const totalCompletedTrades = wins + losses;

        setStats({
            totalValue,
            totalPnL,
            winRate: totalCompletedTrades > 0 ? (wins / totalCompletedTrades) * 100 : 0,
            activePositions: positions.length,
            totalTrades: trades.length
        });
    };

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value);
    };

    const formatPercent = (value) => {
        return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black p-4 md:p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="flex items-center justify-center gap-3 mb-4">
                        <div className="bg-gradient-to-br from-orange-500 to-orange-600 p-3 rounded-xl shadow-lg shadow-orange-500/50">
                            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" strokeWidth="2"/>
                                <circle cx="12" cy="12" r="6" strokeWidth="2"/>
                                <circle cx="12" cy="12" r="2" strokeWidth="2"/>
                            </svg>
                        </div>
                        <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent">
                            Opinion Portfolio Tracker
                        </h1>
                    </div>
                    <p className="text-orange-200/80">Відстежуйте свій портфоліо на Opinion Protocol</p>
                    <p className="text-gray-400 text-sm mt-2">BNB Chain • Real-time Data</p>
                </div>

                {/* Wallet Input */}
                <div className="bg-gradient-to-br from-gray-900 to-black backdrop-blur-lg rounded-2xl p-6 mb-8 border border-orange-500/30 shadow-xl shadow-orange-500/10">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1 relative">
                            <svg className="absolute left-4 top-1/2 transform -translate-y-1/2 text-orange-400 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <rect x="2" y="4" width="20" height="16" rx="2" strokeWidth="2"/>
                                <path d="M2 10h20" strokeWidth="2"/>
                            </svg>
                            <input
                                type="text"
                                value={inputAddress}
                                onChange={(e) => setInputAddress(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && fetchData(inputAddress.trim())}
                                placeholder="Введіть адресу гаманця (0x...)"
                                className="w-full pl-12 pr-4 py-3 bg-black/50 border border-orange-500/50 rounded-xl text-white placeholder-orange-300/50 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                            />
                        </div>
                        <button
                            onClick={() => fetchData(inputAddress.trim())}
                            disabled={loading}
                            className="px-8 py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:from-gray-600 disabled:to-gray-700 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-500/50 disabled:shadow-none"
                        >
                            {loading ? (
                                <>
                                    <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path d="M21 12a9 9 0 11-6.219-8.56" strokeWidth="2" strokeLinecap="round"/>
                                    </svg>
                                    Завантаження...
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                    Переглянути портфоліо
                                </>
                            )}
                        </button>
                    </div>
                    
                    {error && (
                        <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
                            <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" strokeWidth="2"/>
                                <line x1="12" y1="8" x2="12" y2="12" strokeWidth="2" strokeLinecap="round"/>
                                <circle cx="12" cy="16" r="0.5" fill="currentColor" strokeWidth="1"/>
                            </svg>
                            <span className="text-red-300">{error}</span>
                        </div>
                    )}
                    
                    {success && !error && (
                        <div className="mt-4 p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-start gap-3">
                            <svg className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" strokeWidth="2"/>
                                <polyline points="9 12 11 14 15 10" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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
                                        <line x1="12" y1="2" x2="12" y2="22" strokeWidth="2" strokeLinecap="round"/>
                                        <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" strokeWidth="2" strokeLinecap="round"/>
                                    </svg>
                                    <span className="text-sm opacity-80">Загальна вартість</span>
                                </div>
                                <div className="text-3xl font-bold">{formatCurrency(stats.totalValue)}</div>
                                <div className="text-sm opacity-70 mt-1">{stats.activePositions} позицій</div>
                            </div>

                            <div className={`bg-gradient-to-br ${stats.totalPnL >= 0 ? 'from-green-500 to-green-600' : 'from-red-500 to-red-600'} rounded-2xl p-6 text-white shadow-xl`}>
                                <div className="flex items-center justify-between mb-2">
                                    <svg className="w-8 h-8 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <polyline points={stats.totalPnL >= 0 ? "23 6 13.5 15.5 8.5 10.5 1 18" : "23 18 13.5 8.5 8.5 13.5 1 6"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        <polyline points={stats.totalPnL >= 0 ? "17 6 23 6 23 12" : "17 18 23 18 23 12"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                    <span className="text-sm opacity-80">Загальний PnL</span>
                                </div>
                                <div className="text-3xl font-bold">{formatCurrency(stats.totalPnL)}</div>
                                <div className="text-sm opacity-70 mt-1">{formatPercent(stats.totalValue > 0 ? (stats.totalPnL / stats.totalValue) * 100 : 0)}</div>
                            </div>

                            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-6 text-white shadow-xl">
                                <div className="flex items-center justify-between mb-2">
                                    <svg className="w-8 h-8 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <circle cx="12" cy="12" r="10" strokeWidth="2"/>
                                        <circle cx="12" cy="12" r="6" strokeWidth="2"/>
                                        <circle cx="12" cy="12" r="2" strokeWidth="2"/>
                                    </svg>
                                    <span className="text-sm opacity-80">Win Rate</span>
                                </div>
                                <div className="text-3xl font-bold">{stats.winRate.toFixed(1)}%</div>
                                <div className="text-sm opacity-70 mt-1">Успішність</div>
                            </div>

                            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white shadow-xl">
                                <div className="flex items-center justify-between mb-2">
                                    <svg className="w-8 h-8 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                    <span className="text-sm opacity-80">Всього трейдів</span>
                                </div>
                                <div className="text-3xl font-bold">{stats.totalTrades}</div>
                                <div className="text-sm opacity-70 mt-1">Операцій</div>
                            </div>
                        </div>

                        {/* Positions Table */}
                        <div className="bg-gradient-to-br from-gray-900 to-black rounded-2xl p-6 border border-orange-500/20 shadow-xl mb-8">
                            <h3 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                                <svg className="w-6 h-6 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                Активні позиції
                            </h3>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-orange-500/20">
                                            <th className="text-left py-3 px-4 text-orange-200 font-semibold">Ринок</th>
                                            <th className="text-right py-3 px-4 text-orange-200 font-semibold">Розмір</th>
                                            <th className="text-right py-3 px-4 text-orange-200 font-semibold">Ціна входу</th>
                                            <th className="text-right py-3 px-4 text-orange-200 font-semibold">Поточна</th>
                                            <th className="text-right py-3 px-4 text-orange-200 font-semibold">Вартість</th>
                                            <th className="text-right py-3 px-4 text-orange-200 font-semibold">PnL</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {positions.length === 0 ? (
                                            <tr>
                                                <td colSpan="6" className="text-center py-8 text-gray-400">
                                                    Немає активних позицій
                                                </td>
                                            </tr>
                                        ) : (
                                            positions.map((pos, idx) => {
                                                const size = parseFloat(pos.size || 0);
                                                const entryPrice = parseFloat(pos.entryPrice || 0);
                                                const currentPrice = parseFloat(pos.currentPrice || 0);
                                                const value = size * currentPrice;
                                                const pnl = size * (currentPrice - entryPrice);
                                                const market = markets[pos.marketId];
                                                const marketTitle = market?.marketTitle || pos.marketTitle || 'Unknown Market';
                                                
                                                return (
                                                    <tr key={idx} className="border-b border-orange-500/10 hover:bg-orange-500/5 transition-colors">
                                                        <td className="py-3 px-4 text-white max-w-xs">
                                                            <div className="truncate">{marketTitle}</div>
                                                            <div className="text-xs text-gray-400 mt-1">{pos.outcome || 'N/A'}</div>
                                                        </td>
                                                        <td className="text-right py-3 px-4 text-white">{size.toFixed(2)}</td>
                                                        <td className="text-right py-3 px-4 text-white">${entryPrice.toFixed(4)}</td>
                                                        <td className="text-right py-3 px-4 text-white font-semibold">${currentPrice.toFixed(4)}</td>
                                                        <td className="text-right py-3 px-4 text-white font-semibold">{formatCurrency(value)}</td>
                                                        <td className={`text-right py-3 px-4 font-bold ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                            {formatCurrency(pnl)}
                                                            <div className="text-xs opacity-70">{formatPercent((pnl / (size * entryPrice)) * 100)}</div>
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
                            <h3 className="text-2xl font-bold text-white mb-4">Останні трейди</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-orange-500/20">
                                            <th className="text-left py-3 px-4 text-orange-200 font-semibold">Дата</th>
                                            <th className="text-left py-3 px-4 text-orange-200 font-semibold">Тип</th>
                                            <th className="text-right py-3 px-4 text-orange-200 font-semibold">Ціна</th>
                                            <th className="text-right py-3 px-4 text-orange-200 font-semibold">Розмір</th>
                                            <th className="text-right py-3 px-4 text-orange-200 font-semibold">Сума</th>
                                            <th className="text-right py-3 px-4 text-orange-200 font-semibold">PnL</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {trades.length === 0 ? (
                                            <tr>
                                                <td colSpan="6" className="text-center py-8 text-gray-400">Немає трейдів</td>
                                            </tr>
                                        ) : (
                                            trades.slice(0, 20).map((trade, idx) => {
                                                const total = parseFloat(trade.price || 0) * parseFloat(trade.size || 0);
                                                const pnl = parseFloat(trade.pnl || 0);
                                                
                                                return (
                                                    <tr key={idx} className="border-b border-orange-500/10 hover:bg-orange-500/5 transition-colors">
                                                        <td className="py-3 px-4 text-white text-sm">
                                                            {new Date(trade.createdAt || Date.now()).toLocaleString('uk-UA', {
                                                                month: 'short',
                                                                day: 'numeric',
                                                                hour: '2-digit',
                                                                minute: '2-digit'
                                                            })}
                                                        </td>
                                                        <td className="py-3 px-4">
                                                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                                                trade.side === 'BUY' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                                            }`}>
                                                                {trade.side || 'N/A'}
                                                            </span>
                                                        </td>
                                                        <td className="text-right py-3 px-4 text-white">${parseFloat(trade.price || 0).toFixed(4)}</td>
                                                        <td className="text-right py-3 px-4 text-white">{parseFloat(trade.size || 0).toFixed(2)}</td>
                                                        <td className="text-right py-3 px-4 text-white font-semibold">{formatCurrency(total)}</td>
                                                        <td className={`text-right py-3 px-4 font-bold ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                            {pnl !== 0 ? formatCurrency(pnl) : '-'}
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
                    <p className="text-orange-300/80">Powered by Opinion Protocol Open API</p>
                    <p>Created for Opinion Builders Program</p>
                    <p className="text-xs text-gray-500">BNB Chain • Real-time Market Data</p>
                </div>
            </div>
        </div>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<OpinionPortfolioTracker />);
