"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const CHART_GRID = "#e2e8f0";
const CHART_AXIS = "#64748b";
const CHART_DARK = "#0f172a";

const TOOLTIP_STYLE = {
  backgroundColor: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  boxShadow: "0 16px 35px -24px rgba(15,23,42,0.4)",
};

export interface RatingDistributionPoint {
  star: string;
  count: number;
  fill: string;
}

interface Props {
  data: RatingDistributionPoint[];
}

export function RatingDistributionChart({ data }: Props) {
  return (
    <Card className="rounded-[1.75rem] border-slate-200/80 bg-white/90 shadow-sm ring-1 ring-slate-900/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-slate-900">Rating Distribution</CardTitle>
        <CardDescription>Count of reviews by star rating</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
            <XAxis
              dataKey="star"
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
              itemStyle={{ fontSize: 12, color: CHART_DARK }}
              cursor={{ fill: "rgba(15,23,42,0.04)" }}
            />
            <Bar dataKey="count" name="Reviews" radius={[6, 6, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={`rating-${entry.star}-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
