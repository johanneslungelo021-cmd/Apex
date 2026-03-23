'use client';

/**
 * Creator Analytics Dashboard Component
 *
 * Comprehensive insights for SA creators:
 * - Revenue breakdown by source (subscriptions, one-time, tips)
 * - Subscriber growth trends
 * - Content performance metrics
 * - Geographic distribution of audience
 * - Payment gateway analysis
 *
 * @module components/dashboard/CreatorAnalyticsDashboard
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';

// Types
interface AnalyticsData {
  overview: {
    totalRevenue: number;
    totalSubscribers: number;
    totalContentViews: number;
    averageRating: number;
    monthlyGrowth: number;
  };
  revenueBySource: Array<{
    source: string;
    amount: number;
    percentage: number;
  }>;
  subscriberTrend: Array<{
    date: string;
    subscribers: number;
    revenue: number;
  }>;
  topContent: Array<{
    id: string;
    title: string;
    views: number;
    revenue: number;
    type: 'article' | 'video' | 'course' | 'template' | 'ebook';
  }>;
  geographicDistribution: Array<{
    province: string;
    percentage: number;
    subscribers: number;
  }>;
  paymentMethods: Array<{
    method: string;
    transactions: number;
    amount: number;
    percentage: number;
  }>;
}

interface CreatorAnalyticsDashboardProps {
  creatorId: string;
  refreshInterval?: number; // milliseconds
}

// Format currency in ZAR
const formatZAR = (amount: number): string => {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

// Format percentage
const formatPercent = (value: number): string => {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
};

// Province names for SA geographic data
const SA_PROVINCES = [
  'Gauteng',
  'Western Cape',
  'KwaZulu-Natal',
  'Eastern Cape',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Free State',
  'Northern Cape',
];

// Animation variants
const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function CreatorAnalyticsDashboard({
  creatorId,
  refreshInterval = 60000, // 1 minute default
}: CreatorAnalyticsDashboardProps) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | '1y'>('30d');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch analytics data
  const fetchAnalytics = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/mpp/analytics?creator_id=${creatorId}&range=${timeRange}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch analytics');
      }

      const result = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [creatorId, timeRange]);

  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchAnalytics, refreshInterval]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchAnalytics();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-600 font-medium">Failed to load analytics</p>
        <p className="text-red-500 text-sm mt-2">{error}</p>
        <button
          onClick={handleRefresh}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
          <p className="text-gray-500 mt-1">
            Track your creator income and audience growth
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Time Range Selector */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as typeof timeRange)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="1y">Last year</option>
          </select>

          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50"
          >
            <svg
              className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Revenue</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatZAR(data.overview.totalRevenue)}
              </p>
              <p className={`text-sm mt-2 ${data.overview.monthlyGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatPercent(data.overview.monthlyGrowth)} this month
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </motion.div>

        <motion.div
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Subscribers</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {data.overview.totalSubscribers.toLocaleString()}
              </p>
              <p className="text-sm text-gray-500 mt-2">Active subscribers</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
        </motion.div>

        <motion.div
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Content Views</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {data.overview.totalContentViews.toLocaleString()}
              </p>
              <p className="text-sm text-gray-500 mt-2">All-time views</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-lg">
              <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
          </div>
        </motion.div>

        <motion.div
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Avg. Rating</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {data.overview.averageRating.toFixed(1)}
              </p>
              <div className="flex items-center mt-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <svg
                    key={star}
                    className={`w-4 h-4 ${star <= Math.round(data.overview.averageRating) ? 'text-yellow-400' : 'text-gray-200'}`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
            </div>
            <div className="p-3 bg-yellow-100 rounded-lg">
              <svg className="w-6 h-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Revenue Chart & Payment Methods */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by Source */}
        <motion.div
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue by Source</h3>
          <div className="space-y-4">
            {data.revenueBySource.map((source, index) => (
              <div key={source.source} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{
                      backgroundColor: ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b'][index % 4],
                    }}
                  />
                  <span className="text-gray-700 capitalize">{source.source}</span>
                </div>
                <div className="text-right">
                  <span className="font-semibold text-gray-900">{formatZAR(source.amount)}</span>
                  <span className="text-sm text-gray-500 ml-2">({source.percentage.toFixed(1)}%)</span>
                </div>
              </div>
            ))}
          </div>
          {/* Simple bar visualization */}
          <div className="mt-6 h-4 rounded-full bg-gray-100 flex overflow-hidden">
            {data.revenueBySource.map((source, index) => (
              <div
                key={source.source}
                className="h-full"
                style={{
                  width: `${source.percentage}%`,
                  backgroundColor: ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b'][index % 4],
                }}
              />
            ))}
          </div>
        </motion.div>

        {/* Payment Methods */}
        <motion.div
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Methods</h3>
          <div className="space-y-3">
            {data.paymentMethods.map((method) => (
              <div key={method.method} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">
                    {method.method === 'card' ? '💳' :
                     method.method === 'eft' ? '🏦' :
                     method.method === 'ussd' ? '📱' : '💰'}
                  </span>
                  <div>
                    <p className="font-medium text-gray-900 capitalize">{method.method}</p>
                    <p className="text-sm text-gray-500">{method.transactions} transactions</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">{formatZAR(method.amount)}</p>
                  <p className="text-sm text-gray-500">{method.percentage.toFixed(1)}%</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Top Performing Content */}
      <motion.div
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Performing Content</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Content</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Type</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Views</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {data.topContent.map((content, index) => (
                <tr key={content.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400 font-mono text-sm">{index + 1}.</span>
                      <span className="font-medium text-gray-900">{content.title}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 capitalize">
                      {content.type}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-gray-600">
                    {content.views.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right font-medium text-gray-900">
                    {formatZAR(content.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Geographic Distribution */}
      <motion.div
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Audience by Province</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.geographicDistribution.map((geo) => (
            <div key={geo.province} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="font-medium text-gray-700">{geo.province}</span>
              <div className="text-right">
                <span className="text-sm text-gray-500">{geo.subscribers} subscribers</span>
                <span className="ml-2 font-semibold text-indigo-600">{geo.percentage.toFixed(1)}%</span>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Data-Saver Mode Notice for SA Market */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-6 border border-indigo-100">
        <div className="flex items-start gap-4">
          <div className="p-2 bg-white rounded-lg shadow-sm">
            <svg className="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900">South African Market Insight</h4>
            <p className="text-sm text-gray-600 mt-1">
              Your audience is primarily from Gauteng and Western Cape. Consider optimizing content
              for mobile viewing and data-saver mode to improve accessibility for users on limited data plans.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
