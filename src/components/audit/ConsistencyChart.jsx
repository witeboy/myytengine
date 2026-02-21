import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

export default function ConsistencyChart({ audit }) {
  const recentVids = (() => {
    try { return JSON.parse(audit.recent_video_data || "[]"); } catch { return []; }
  })();

  if (!recentVids.length) return null;

  const subCount = audit.subscriber_count || 1;
  const chartData = recentVids.map((v, i) => ({
    name: `V${i + 1}`,
    views: v.views,
    vpd: v.vpd,
    title: v.title?.slice(0, 40),
    beat: v.views > subCount,
  })).reverse();

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <h4 className="text-xs font-semibold text-gray-700 mb-3">
        Performance Consistency — {audit.channel_name}
      </h4>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barCategoryGap="20%">
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v >= 1000000 ? (v/1e6).toFixed(1)+"M" : v >= 1000 ? (v/1e3).toFixed(0)+"K" : v} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const d = payload[0].payload;
                return (
                  <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-2 text-xs">
                    <p className="font-medium text-gray-900 mb-1">{d.title}...</p>
                    <p className="text-gray-600">Views: {d.views?.toLocaleString()}</p>
                    <p className="text-gray-600">Views/day: {d.vpd?.toLocaleString()}</p>
                    {d.beat && <p className="text-amber-600 font-medium mt-1">🔥 Beat sub count</p>}
                  </div>
                );
              }}
            />
            <ReferenceLine y={subCount} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "Sub Count", fontSize: 9, fill: "#f59e0b" }} />
            <Bar dataKey="views" radius={[4, 4, 0, 0]} fill="#6366f1" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-gray-400 mt-2 text-center">
        Dashed line = subscriber count. Bars above it = strong CTR signal.
      </p>
    </div>
  );
}