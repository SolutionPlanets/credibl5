"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Single-line colors (Python reference: skyblue fill + slateblue line)
const FILL_COLOR = "#87CEEB";
const LINE_COLOR = "#6A5ACD";
const CHART_GRID = "#e2e8f0";
const CHART_AXIS = "#64748b";
const CHART_DARK = "#0f172a";

const TOOLTIP_STYLE = {
  backgroundColor: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  boxShadow: "0 16px 35px -24px rgba(15,23,42,0.4)",
};

export interface LineConfig {
  key: string;
  name: string;
  color: string;
}

interface Props {
  /** Each object must have a `period` string key plus numeric series keys. */
  data: Array<Record<string, number | string>>;
  /**
   * When undefined → single-line area mode using the `cumulative` key.
   * When provided  → multi-line mode (LineChart), one Line per entry.
   */
  lines?: LineConfig[];
}

export function CumulativeGrowthChart({ data, lines }: Props) {
  const isMulti = Array.isArray(lines) && lines.length > 1;

  return (
    <Card className="rounded-[1.75rem] border-slate-200/80 bg-white/90 shadow-sm ring-1 ring-slate-900/5 lg:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-slate-900">
          Cumulative Review Growth
        </CardTitle>
        <CardDescription>
          {isMulti
            ? "Cumulative total per location over time"
            : "Total review volume accumulated over time"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length < 2 ? (
          <div className="flex h-56 items-center justify-center text-sm text-slate-500">
            Not enough data points for this range
          </div>
        ) : isMulti ? (
          /* ── Multi-location: LineChart, one line per location ─────────── */
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis
                dataKey="period"
                tick={{ fill: CHART_AXIS, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fill: CHART_AXIS, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: CHART_DARK, fontSize: 12 }}
                itemStyle={{ fontSize: 12 }}
                formatter={(value) => [value ?? 0, ""]}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                iconType="circle"
                iconSize={8}
              />
              {lines!.map((l) => (
                <Line
                  key={l.key}
                  type="monotone"
                  dataKey={l.key}
                  name={l.name}
                  stroke={l.color}
                  strokeWidth={2}
                  dot={{ fill: l.color, r: 2.5 }}
                  activeDot={{ r: 4.5 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          /* ── Single location: AreaChart ────────────────────────────────── */
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="cumulativeGrowthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={FILL_COLOR} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={FILL_COLOR} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis
                dataKey="period"
                tick={{ fill: CHART_AXIS, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fill: CHART_AXIS, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: CHART_DARK, fontSize: 12 }}
                itemStyle={{ color: LINE_COLOR, fontSize: 12 }}
                formatter={(value) => [value ?? 0, "Total Reviews"]}
              />
              <Area
                type="monotone"
                dataKey="cumulative"
                name="Cumulative Reviews"
                stroke={LINE_COLOR}
                strokeWidth={2.5}
                fill="url(#cumulativeGrowthGrad)"
                dot={{ fill: LINE_COLOR, r: 3 }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
