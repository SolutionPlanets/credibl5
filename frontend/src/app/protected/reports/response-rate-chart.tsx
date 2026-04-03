"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const CHART_GRID = "#e2e8f0";
const CHART_AXIS = "#64748b";
const CHART_SECONDARY = "#9747FF";
const CHART_DARK = "#0f172a";

const TOOLTIP_STYLE = {
  backgroundColor: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  boxShadow: "0 16px 35px -24px rgba(15,23,42,0.4)",
};

export interface ResponseRatePoint {
  period: string;
  responseRate: number;
}

interface Props {
  data: ResponseRatePoint[];
}

export function ResponseRateChart({ data }: Props) {
  return (
    <Card className="rounded-[1.75rem] border-slate-200/80 bg-white/90 shadow-sm ring-1 ring-slate-900/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-slate-900">Response Rate Trend</CardTitle>
        <CardDescription>Percent of reviews with replies over time</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length < 2 ? (
          <div className="flex h-56 items-center justify-center text-sm text-slate-500">
            Not enough data points for this range
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="responseRateGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_SECONDARY} stopOpacity={0.26} />
                  <stop offset="95%" stopColor={CHART_SECONDARY} stopOpacity={0} />
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
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: CHART_DARK, fontSize: 12 }}
                itemStyle={{ color: CHART_SECONDARY, fontSize: 12 }}
                formatter={(value: number) => [`${value}%`, "Response Rate"]}
              />
              <Area
                type="monotone"
                dataKey="responseRate"
                name="Response Rate"
                stroke={CHART_SECONDARY}
                strokeWidth={2.5}
                fill="url(#responseRateGrad)"
                dot={{ fill: CHART_SECONDARY, r: 3 }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
