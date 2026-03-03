import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ArrowUpRight, ArrowDownRight, Activity, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface Trade {
  id: number;
  tokenSymbol: string;
  type: string;
  mode: string;
  tradingMode?: string;
  status?: string;
  amount: string;
  price: string;
  currentPrice?: string | null;
  pnl: string | null;
  exitPrice?: string | null;
  txHash?: string | null;
  timestamp: string;
  closedAt?: string | null;
}

export function LiveFeedTable({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground border border-dashed border-border/50 rounded-lg bg-black/20" data-testid="text-no-trades">
        <Activity className="h-8 w-8 mb-3 opacity-20" />
        <p>No recent trade activity detected</p>
        <p className="text-xs mt-1 opacity-50">Bot is scanning for opportunities...</p>
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
            <TableHead className="text-xs font-bold uppercase tracking-wider">Status</TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wider">Strategy</TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wider">Env</TableHead>
            <TableHead className="text-right text-xs font-bold uppercase tracking-wider">Size (SOL)</TableHead>
            <TableHead className="text-right text-xs font-bold uppercase tracking-wider">Entry</TableHead>
            <TableHead className="text-right text-xs font-bold uppercase tracking-wider">Current</TableHead>
            <TableHead className="text-right text-xs font-bold uppercase tracking-wider">PNL</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trades.map((trade, i) => {
            const pnlNum = parseFloat(trade.pnl || "0");
            const isOpen = trade.status === "OPEN";
            const entryPrice = parseFloat(trade.price || "0");
            const curPrice = parseFloat(trade.currentPrice || trade.exitPrice || trade.price || "0");

            const formatPrice = (p: number) => {
              if (p === 0) return "—";
              if (p < 0.0001) return `$${p.toExponential(2)}`;
              if (p < 1) return `$${p.toFixed(6)}`;
              return `$${p.toFixed(4)}`;
            };

            return (
              <motion.tr
                key={trade.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className={cn(
                  "border-border/40 hover:bg-white/5 transition-colors group",
                  isOpen && "bg-primary/5"
                )}
                data-testid={`row-trade-${trade.id}`}
              >
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {format(new Date(trade.timestamp), "HH:mm:ss")}
                </TableCell>
                <TableCell className="font-bold text-foreground">
                  <span className="text-primary mr-1">$</span>{trade.tokenSymbol}
                </TableCell>
                <TableCell>
                  {isOpen ? (
                    <Badge variant="outline" className="text-[10px] h-5 border-0 font-bold bg-yellow-500/20 text-yellow-400 animate-pulse" data-testid={`badge-status-${trade.id}`}>
                      <Clock className="h-3 w-3 mr-1" />
                      OPEN
                    </Badge>
                  ) : (
                    <Badge variant="outline" className={cn(
                      "text-[10px] h-5 border-0 font-bold",
                      pnlNum >= 0 ? "bg-primary/20 text-primary" : "bg-destructive/20 text-destructive"
                    )} data-testid={`badge-status-${trade.id}`}>
                      {pnlNum >= 0 ? "WIN" : "LOSS"}
                    </Badge>
                  )}
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
                <TableCell className="text-right font-mono text-xs text-muted-foreground">
                  {formatPrice(entryPrice)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {isOpen ? (
                    <span className={cn(
                      "font-bold",
                      curPrice > entryPrice ? "text-primary" : curPrice < entryPrice ? "text-destructive" : "text-muted-foreground"
                    )}>
                      {formatPrice(curPrice)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{formatPrice(curPrice)}</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {trade.pnl ? (
                    <div className={cn(
                      "flex items-center justify-end gap-1 font-bold font-mono",
                      pnlNum >= 0 ? "text-primary text-glow" : "text-destructive"
                    )}>
                      {pnlNum >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {pnlNum > 0 ? "+" : ""}{pnlNum.toFixed(2)}%
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
              </motion.tr>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
