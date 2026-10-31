"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money } from "@/lib/navigation";

export function CollectionsChart({ data }: { data: { month: string; amount: number }[] }) {
  const maxAmount = Math.max(0.001, ...data.map((row) => row.amount));
  const axisLabel = (value: number) => value === 0 ? "0" : value >= 1 ? `${Number(value.toFixed(1))}M` : `${Number((value * 1000).toFixed(1))}k`;
  return <div className="h-[256px] w-full" role="img" aria-label="Cobros mensuales durante los últimos doce meses">
    <ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{top:12,right:10,left:0,bottom:0}}>
      <defs><linearGradient id="collections-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--blue)" stopOpacity={0.16}/><stop offset="100%" stopColor="var(--blue)" stopOpacity={0.01}/></linearGradient></defs>
      <CartesianGrid stroke="var(--line)" vertical={false} strokeDasharray="3 3"/>
      <XAxis dataKey="month" tick={{fontSize:11,fill:"var(--muted)"}} axisLine={false} tickLine={false} tickMargin={12}/>
      <YAxis domain={[0,maxAmount * 1.15]} tickFormatter={axisLabel} tick={{fontSize:11,fill:"var(--muted)"}} axisLine={false} tickLine={false} width={46}/>
      <Tooltip formatter={(value)=>[money(Number(value)*1_000_000),"Cobros"]} contentStyle={{borderRadius:14,border:"1px solid var(--line)",background:"var(--surface)",color:"var(--ink)",boxShadow:"var(--shadow)",fontSize:12}} labelStyle={{color:"var(--ink)"}} itemStyle={{color:"var(--accent)"}}/>
      <Area isAnimationActive={false} type="monotone" dataKey="amount" stroke="var(--blue)" fill="url(#collections-fill)" strokeWidth={2.5} dot={{r:3,fill:"var(--blue)",strokeWidth:2,stroke:"var(--surface)"}} activeDot={{r:5}}/>
    </AreaChart></ResponsiveContainer>
  </div>;
}
