import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

// ============================================
// BOT STATUS
// ============================================
export function useBotStatus() {
  return useQuery({
    queryKey: [api.status.get.path],
    queryFn: async () => {
      const res = await fetch(api.status.get.path);
      if (!res.ok) throw new Error("Failed to fetch bot status");
      // In a real app with Zod schemas matching exactly, we would parse here.
      // For now, we trust the backend returns the shape matching schema.ts
      return await res.json();
    },
    refetchInterval: 2000, // Poll every 2s for "live" feel
  });
}

// ============================================
// TRADES
// ============================================
export function useTrades() {
  return useQuery({
    queryKey: [api.trades.list.path],
    queryFn: async () => {
      const res = await fetch(api.trades.list.path);
      if (!res.ok) throw new Error("Failed to fetch trades");
      return await res.json();
    },
    refetchInterval: 3000,
  });
}

// ============================================
// CANDIDATES (Sniper Mode)
// ============================================
export function useCandidates() {
  return useQuery({
    queryKey: [api.candidates.list.path],
    queryFn: async () => {
      const res = await fetch(api.candidates.list.path);
      if (!res.ok) throw new Error("Failed to fetch candidates");
      return await res.json();
    },
    refetchInterval: 3000,
  });
}
