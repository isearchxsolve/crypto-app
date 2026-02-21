import { Layout } from "@/components/layout";
import { StatCard } from "@/components/stat-card";
import { LiveFeedTable } from "@/components/live-feed-table";
import { useBotStatus, useTrades, useCandidates } from "@/hooks/use-bot-data";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, Play, Pause, RefreshCw, Crosshair, TrendingUp, Wallet, ShieldCheck, Flame } from "lucide-react";
import { motion } from "framer-motion";

export default function Dashboard() {
  const { data: status, isLoading: statusLoading, error: statusError } = useBotStatus();
  const { data: trades, isLoading: tradesLoading } = useTrades();
  const { data: candidates, isLoading: candidatesLoading } = useCandidates();

  if (statusError) {
    return (
      <Layout>
        <div className="flex h-full items-center justify-center">
          <div className="text-destructive flex flex-col items-center gap-4 border border-destructive/20 p-8 rounded-lg bg-destructive/5">
            <AlertCircle className="h-12 w-12" />
            <h2 className="text-xl font-bold uppercase">System Malfunction</h2>
            <p>Could not connect to bot mainframe. Check server connection.</p>
          </div>
        </div>
      </Layout>
    );
  }

  // Ensure arrays are arrays (handling API response potential issues)
  const tradeList = Array.isArray(trades) ? trades : [];
  const candidateList = Array.isArray(candidates) ? candidates : [];
  
  // Safe defaults for status
  const isRunning = status?.isRunning ?? false;
  const currentMode = status?.mode ?? "IDLE";
  const walletBalance = status?.walletBalance ?? "0.00";
  const totalPnl = status?.totalPnl ?? "0.00";

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header Actions */}
        <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
          <div>
            <h1 className="text-3xl font-bold font-display uppercase tracking-widest text-white">
              Command <span className="text-primary text-glow">Center</span>
            </h1>
            <p className="text-muted-foreground mt-1 text-sm font-mono">
              Live Connection: <span className="text-primary">wss://sol-mainnet-beta...</span>
            </p>
          </div>
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              className="border-primary/50 text-primary hover:bg-primary/10 hover:text-primary transition-all shadow-[0_0_15px_-5px_rgba(38,217,98,0.3)]"
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Sync Chain
            </Button>
            <Button 
              className={isRunning 
                ? "bg-destructive text-white hover:bg-destructive/80 shadow-[0_0_20px_-5px_rgba(239,68,68,0.5)]" 
                : "bg-primary text-black hover:bg-primary/90 shadow-[0_0_20px_-5px_rgba(38,217,98,0.5)]"
              }
            >
              {isRunning ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
              {isRunning ? "STOP BOT" : "START ENGINE"}
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard 
            label="Current Mode" 
            value={currentMode} 
            icon={Crosshair}
            color="secondary"
            animate={true}
          />
          <StatCard 
            label="Status" 
            value={isRunning ? "ONLINE" : "OFFLINE"} 
            icon={ShieldCheck}
            color={isRunning ? "primary" : "destructive"}
            animate={true}
          />
          <StatCard 
            label="Wallet Balance" 
            value={`${walletBalance} SOL`} 
            subValue="≈ $1,240.50" 
            icon={Wallet}
            animate={true}
          />
          <StatCard 
            label="Total PNL" 
            value={`${Number(totalPnl) > 0 ? '+' : ''}${totalPnl}%`} 
            icon={TrendingUp}
            trend={Number(totalPnl) >= 0 ? "up" : "down"}
            color={Number(totalPnl) >= 0 ? "primary" : "destructive"}
            animate={true}
          />
        </div>

        {/* Main Content Area */}
        <Tabs defaultValue="trades" className="space-y-4">
          <TabsList className="bg-black/40 border border-border/50 p-1">
            <TabsTrigger 
              value="trades"
              className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary font-display uppercase tracking-wider"
            >
              Live Trades
            </TabsTrigger>
            <TabsTrigger 
              value="candidates"
              className="data-[state=active]:bg-secondary/20 data-[state=active]:text-secondary font-display uppercase tracking-wider"
            >
              Sniper Candidates
            </TabsTrigger>
          </TabsList>

          {/* TRADES TAB */}
          <TabsContent value="trades" className="space-y-4">
            <Card className="bg-card/40 border-border/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-lg font-display uppercase tracking-wider flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  Recent Execution Log
                </CardTitle>
              </CardHeader>
              <CardContent>
                {tradesLoading ? (
                  <div className="h-40 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : (
                  <LiveFeedTable trades={tradeList} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* CANDIDATES TAB */}
          <TabsContent value="candidates" className="space-y-4">
            <Card className="bg-card/40 border-border/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-lg font-display uppercase tracking-wider flex items-center gap-2">
                  <Flame className="h-5 w-5 text-secondary" />
                  Detected Opportunities (Mempool)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {candidatesLoading ? (
                  <div className="h-40 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-secondary"></div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-border/50 bg-black/20 backdrop-blur-sm overflow-hidden">
                    <Table>
                      <TableHeader className="bg-white/5">
                        <TableRow className="border-border/50 hover:bg-transparent">
                          <TableHead className="text-xs font-bold uppercase tracking-wider">Token</TableHead>
                          <TableHead className="text-xs font-bold uppercase tracking-wider">Address</TableHead>
                          <TableHead className="text-xs font-bold uppercase tracking-wider text-right">Liquidity</TableHead>
                          <TableHead className="text-xs font-bold uppercase tracking-wider text-right">Pump Prob.</TableHead>
                          <TableHead className="text-xs font-bold uppercase tracking-wider text-right">Age</TableHead>
                          <TableHead className="text-xs font-bold uppercase tracking-wider text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {candidateList.length === 0 ? (
                           <TableRow>
                             <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                               Scanning mempool for new pairs...
                             </TableCell>
                           </TableRow>
                        ) : (
                          candidateList.map((cand, i) => (
                            <motion.tr
                              key={cand.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.05 }}
                              className="border-border/40 hover:bg-white/5 transition-colors"
                            >
                              <TableCell className="font-bold">
                                <span className="text-secondary">$</span>{cand.tokenSymbol}
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {cand.tokenAddress.substring(0, 4)}...{cand.tokenAddress.substring(cand.tokenAddress.length - 4)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">${cand.liquidity}</TableCell>
                              <TableCell className="text-right">
                                <Badge variant="outline" className={cn(
                                  "border-0 font-bold",
                                  Number(cand.pumpProbability) > 80 ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                                )}>
                                  {cand.pumpProbability}%
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs text-muted-foreground">
                                {cand.ageSeconds}s
                              </TableCell>
                              <TableCell className="text-right">
                                <Button size="sm" variant="secondary" className="h-7 text-xs bg-secondary/20 hover:bg-secondary/40 text-secondary border border-secondary/50">
                                  SNIPE
                                </Button>
                              </TableCell>
                            </motion.tr>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
