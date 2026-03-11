'use client';

import { useState, useEffect, useTransition } from 'react';
import { TrendingUp, TrendingDown, RefreshCw, ArrowLeft, DollarSign, Activity, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import type { TradingData } from '@/app/api/trading/route';

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString('en-ZA', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function ChangeTag({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${positive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
      {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {positive ? '+' : ''}{fmt(value, 2)}%
    </span>
  );
}

export default function TradingPage() {
  const [data, setData] = useState<TradingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  // Perf: non-urgent market data update — user can still interact while data arrives
  // isPending keeps skeleton visible and prevents lastRefresh updating before data commits
  const [isPending, startDataTransition] = useTransition();

  const fetchData = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/trading');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as TradingData;
      // Fix: keep setData and setLastRefresh in the same transition so they
      // commit atomically — prevents showing 'Updated' timestamp before data renders
      startDataTransition(() => {
        setData(json);
        setLastRefresh(new Date());
      });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchData(); }, []);

  return (
    <div className="min-h-screen bg-[#09090b] text-white font-sans">
      {/* Header */}
      <div className="max-w-5xl mx-auto px-8 pt-10 pb-6">
        <Link href="/" className="flex items-center gap-2 text-zinc-400 hover:text-white transition text-sm mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Apex
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-5xl font-semibold flex items-center gap-3">
              <TrendingUp className="w-10 h-10 text-emerald-400" /> Trading
            </h1>
            <p className="text-zinc-400 mt-2 max-w-xl">
              Live ZAR market data — forex, JSE, and crypto prices powered by Perplexity Sonar.
            </p>
          </div>
          <div className="flex items-center gap-3 mt-2">
            {lastRefresh && (
              <span className="text-xs text-zinc-500">
                Updated {lastRefresh.toLocaleTimeString('en-ZA')}
              </span>
            )}
            <button
              onClick={() => void fetchData()}
              disabled={loading}
              className="glass px-4 py-2 rounded-xl text-sm flex items-center gap-2 hover:bg-white/15 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-8 pb-20 space-y-6">
        <AnimatePresence mode="wait">
          {/* Fix: use (loading || isPending) so skeleton shows until transition commits */}
          {(loading || isPending) && !data && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="glass rounded-2xl p-5 animate-pulse h-24" />
              ))}
            </motion.div>
          )}

          {error && !data && (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="glass rounded-2xl p-8 text-center text-zinc-400">
              <Activity className="w-8 h-8 mx-auto mb-3 text-red-400" />
              <p>Unable to fetch market data. Check your Perplexity API key.</p>
              <button onClick={() => void fetchData()} className="mt-4 glass px-4 py-2 rounded-xl text-sm hover:bg-white/15 transition">
                Try again
              </button>
            </motion.div>
          )}

          {data && (
            <motion.div key="data" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              {/* ZAR Rate — hero */}
              <div className="glass rounded-2xl p-6 mb-6 border border-emerald-500/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-zinc-400 text-sm mb-1">USD/ZAR Exchange Rate</p>
                    <p className="text-5xl font-semibold">R{fmt(data.zarUsd)}</p>
                    <p className="text-zinc-500 text-xs mt-1">per 1 US Dollar</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <ChangeTag value={data.zarUsdChange24h} />
                    <span className="text-xs text-zinc-600">24h change</span>
                  </div>
                </div>
              </div>

              {/* Crypto prices */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {[
                  { label: 'Bitcoin', value: data.btcZar, icon: '₿', color: 'text-orange-400' },
                  { label: 'Ethereum', value: data.ethZar, icon: 'Ξ', color: 'text-blue-400' },
                  { label: 'XRP', value: data.xrpZar, icon: '✕', color: 'text-purple-400' },
                ].map((coin) => (
                  <div key={coin.label} className="glass rounded-2xl p-5">
                    <p className="text-zinc-400 text-sm flex items-center gap-2">
                      <span className={coin.color}>{coin.icon}</span> {coin.label} in ZAR
                    </p>
                    <p className="text-2xl font-semibold mt-2">
                      R{coin.value > 1000 ? fmt(coin.value, 0) : fmt(coin.value, 4)}
                    </p>
                  </div>
                ))}
              </div>

              {/* JSE ALSI */}
              <div className="glass rounded-2xl p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-yellow-400" /> JSE All Share Index
                  </h2>
                  <ChangeTag value={data.jseAlsiChange} />
                </div>
                <p className="text-4xl font-semibold">{fmt(data.jseAlsi, 0)}</p>
              </div>

              {/* Top Movers */}
              {data.topMovers.length > 0 && (
                <div className="glass rounded-2xl p-6">
                  <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
                    <Zap className="w-5 h-5 text-yellow-400" /> JSE Top Movers Today
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {data.topMovers.map((mover) => (
                      <div key={mover.ticker} className="bg-white/5 rounded-xl p-4 flex items-center justify-between">
                        <div>
                          <p className="font-medium">{mover.name}</p>
                          <p className="text-xs text-zinc-500">{mover.ticker}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">R{fmt(mover.price, 2)}</p>
                          <ChangeTag value={mover.change} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-zinc-600 mt-4 text-center">
                Data sourced via Perplexity Sonar · {new Date(data.updatedAt).toLocaleString('en-ZA')}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
