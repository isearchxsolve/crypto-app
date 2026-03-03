import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ArrowUpRight, ArrowDownRight, Activity } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface Trade {
  id: number;
  tokenSymbol: string;
  type: string;
  mode: string;
  tradingMode?: string;
  amount: string;
  price: string;
  pnl: string | null;
  exitPrice?: string | null;
  txHash?: string | null;
  timestamp: string;
}

export function LiveFeedTable({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground border border-dashed border-border/50 rounded-lg bg-black/20" data-testid="text-no-trades">
        <Activity className="h-8 w-8 mb-3 opacity-20" />
        <p>No recent trade activity detected</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/50 bg-black/20 backdrop-blur-sm overflow-hidden">
      <Table>
        <TableHeader className="bg-white/5">
          <TableRow className="border-border/50 hover:bg-transparent">
            <TableHead className="w-[80px] text-xs font-bold uppercase tracking-wider">Time</TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wider">Token</TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wider">Type</TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wider">Strategy</TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wider">Env</TableHead>
            <TableHead className="text-right text-xs font-bold uppercase tracking-wider">Size (SOL)</TableHead>
            <TableHead className="text-right text-xs font-bold uppercase tracking-wider">Entry</TableHead>
            <TableHead className="text-right text-xs font-bold uppercase tracking-wider">PNL</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trades.map((trade, i) => (
            <motion.tr
              key={trade.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="border-border/40 hover:bg-white/5 transition-colors group"
              data-testid={`row-trade-${trade.id}`}
            >
              <TableCell className="font-mono text-xs text-muted-foreground">
                {format(new Date(trade.timestamp), "HH:mm:ss")}
              </TableCell>
              <TableCell className="font-bold text-foreground">
                <span className="text-primary mr-1">$</span>{trade.tokenSymbol}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={cn(
                  "text-[10px] h-5 border-0 font-bold",
                  trade.type === "BUY" ? "bg-primary/20 text-primary" : "bg-destructive/20 text-destructive"
                )}>
                  {trade.type}
                </Badge>
              </TableCell>
              <TableCell>
                <span className="text-[10px] font-mono text-muted-foreground bg-white/5 px-2 py-1 rounded">
                  {trade.mode}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={cn(
                  "text-[10px] h-5 border-0 font-bold",
                  trade.tradingMode === "live" ? "bg-destructive/20 text-destructive" : "bg-blue-500/20 text-blue-400"
                )}>
                  {trade.tradingMode === "live" ? "LIVE" : "PAPER"}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-mono text-sm">{trade.amount}</TableCell>
              <TableCell className="text-right font-mono text-sm text-muted-foreground">${Number(trade.price).toFixed(6)}</TableCell>
              <TableCell className="text-right">
                {trade.pnl ? (
                  <div className={cn(
                    "flex items-center justify-end gap-1 font-bold font-mono",
                    Number(trade.pnl) >= 0 ? "text-primary text-glow" : "text-destructive"
                  )}>
                    {Number(trade.pnl) >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {Number(trade.pnl) > 0 ? "+" : ""}{trade.pnl}%
                  </div>
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                )}
              </TableCell>
            </motion.tr>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
