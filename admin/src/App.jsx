import { useState, useEffect, useMemo } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";

const API_BASE = "http://74.50.109.203:3000";
const ADMIN_KEY = "nuro_admin_prod";

// ── WHITELIST: add/remove wallets here ───────────────────────────────────────
const WHITELIST = [
  { address: "0x27FbEAD2B527AaDAf4EA7B3Af065244A3964ECBC", role: "superadmin", label: "Deployer" },
  { address: "0x749edFC84A28793ce150d4E7E71bcEe73C454b56", role: "admin",      label: "Fee Vault" },
];

const CHAINS = {
  8453:  { name: "Base",      color: "#0052FF", icon: "⬡" },
  42161: { name: "Arbitrum",  color: "#28A0F0", icon: "◈" },
  10:    { name: "Optimism",  color: "#FF0420", icon: "⬤" },
  137:   { name: "Polygon",   color: "#8247E5", icon: "⬟" },
  43114: { name: "Avalanche", color: "#E84142", icon: "▲" },
  56:    { name: "BSC",       color: "#F0B90B", icon: "◆" },
  1:     { name: "Ethereum",  color: "#627EEA", icon: "⬡" },
  999:   { name: "HyperEVM",  color: "#00FF88", icon: "H" },
};

function fmt(n) { return (n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(d) { return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
function short(addr) { return addr ? addr.slice(0, 6) + "…" + addr.slice(-4) : ""; }
function filterByPeriod(txs, period) {
  const now = Date.now();
  const ms = { day: 86400000, week: 7*86400000, month: 30*86400000, year: 365*86400000 }[period] ?? Infinity;
  return period === "all" ? txs : txs.filter(t => now - new Date(t.timestamp).getTime() < ms);
}
async function apiFetch(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: { "x-admin-key": ADMIN_KEY } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

const ChainBadge = ({ chainId, small }) => {
  const c = CHAINS[chainId] || { name: String(chainId), color: "#888", icon: "?" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: c.color + "22", border: `1px solid ${c.color}55`,
      color: c.color, borderRadius: 4, padding: small ? "2px 6px" : "3px 8px",
      fontSize: small ? 11 : 12, fontWeight: 600, whiteSpace: "nowrap",
    }}>
      <span style={{ fontSize: small ? 10 : 11 }}>{c.icon}</span> {c.name}
    </span>
  );
};

const StatCard = ({ label, value, sub, accent }) => (
  <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 10, padding: "18px 22px", flex: 1, minWidth: 160 }}>
    <div style={{ color: "#8b949e", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{label}</div>
    <div style={{ color: accent || "#e6edf3", fontSize: 22, fontWeight: 700, fontFamily: "'Space Mono', monospace" }}>{value}</div>
    {sub && <div style={{ color: "#6e7681", fontSize: 11, marginTop: 4 }}>{sub}</div>}
  </div>
);

const MiniBar = ({ data, color }) => {
  const max = Math.max(...data.map(d => d.v), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 36 }}>
      {data.map((d, i) => (
        <div key={i} title={`${d.label}: $${fmt(d.v)}`} style={{
          flex: 1, height: `${(d.v / max) * 100}%`, minHeight: 2,
          background: color, borderRadius: "2px 2px 0 0", opacity: 0.7 + (i / data.length) * 0.3,
        }} />
      ))}
    </div>
  );
};

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const { address, isConnected } = useAccount();

  const walletEntry = useMemo(() => {
    if (!address) return null;
    return WHITELIST.find(w => w.address.toLowerCase() === address.toLowerCase()) || null;
  }, [address]);

  const isAuthorized = isConnected && walletEntry !== null;
  const role = walletEntry?.role;
  const canAdmin = role === "superadmin" || role === "admin";

  const [tab, setTab]               = useState("overview");
  const [period, setPeriod]         = useState("month");
  const [chainFilter, setChainFilter] = useState("all");
  const [search, setSearch]         = useState("");
  const [selectedTx, setSelectedTx] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [allTxs, setAllTxs]         = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const txs = await apiFetch("/admin/transactions");
      setAllTxs(txs);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      fetchData();
      const interval = setInterval(fetchData, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthorized]);

  const periodTxs = useMemo(() => filterByPeriod(allTxs, period), [allTxs, period]);
  const filtered = useMemo(() => {
    let txs = periodTxs;
    if (chainFilter !== "all") txs = txs.filter(t => t.sourceChain === Number(chainFilter));
    if (search) {
      const q = search.toLowerCase();
      txs = txs.filter(t =>
        t.userId?.toLowerCase().includes(q) ||
        t.txHash?.toLowerCase().includes(q) ||
        t.userWallet?.toLowerCase().includes(q)
      );
    }
    return txs;
  }, [periodTxs, chainFilter, search]);

  const totalVol  = useMemo(() => filtered.reduce((s, t) => s + t.amount, 0), [filtered]);
  const totalFees = useMemo(() => filtered.reduce((s, t) => s + t.fee, 0), [filtered]);
  const confirmed = useMemo(() => filtered.filter(t => t.status === "confirmed").length, [filtered]);
  const hypeVol   = useMemo(() => filtered.filter(t => t.token === "HYPE").reduce((s, t) => s + t.amount, 0), [filtered]);
  const chainVols = useMemo(() => {
    const map = {};
    filtered.forEach(t => { map[t.sourceChain] = (map[t.sourceChain] || 0) + t.amount; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filtered]);
  const dailyVol = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(Date.now() - (13 - i) * 86400000);
      return { label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), v: 0 };
    });
    const now = Date.now();
    allTxs.forEach(t => {
      const daysAgo = Math.floor((now - new Date(t.timestamp).getTime()) / 86400000);
      if (daysAgo < 14) days[13 - daysAgo].v += t.amount;
    });
    return days;
  }, [allTxs]);
  const activeUsers = useMemo(() => new Set(filtered.map(t => t.userId)).size, [filtered]);

  // ── NOT CONNECTED ──────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div style={{ minHeight: "100vh", background: "#010409", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'IBM Plex Mono', monospace" }}>
        <div style={{ width: 420, background: "#0d1117", border: "1px solid #21262d", borderRadius: 14, padding: 40, textAlign: "center" }}>
          <div style={{ width: 52, height: 52, borderRadius: 12, background: "linear-gradient(135deg, #00FF88, #0052FF)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 900, color: "#000", margin: "0 auto 20px" }}>C</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6, color: "#e6edf3" }}>Nuro Admin</div>
          <div style={{ fontSize: 12, color: "#8b949e", marginBottom: 28 }}>Connect your wallet to continue</div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <ConnectButton />
          </div>
        </div>
      </div>
    );
  }

  // ── CONNECTED BUT NOT WHITELISTED ──────────────────────────────────────────
  if (isConnected && !isAuthorized) {
    return (
      <div style={{ minHeight: "100vh", background: "#010409", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'IBM Plex Mono', monospace" }}>
        <div style={{ width: 420, background: "#0d1117", border: "1px solid #21262d", borderRadius: 14, padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>🚫</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#f85149", marginBottom: 8 }}>Access Denied</div>
          <div style={{ fontSize: 12, color: "#8b949e", marginBottom: 6 }}>
            <span style={{ color: "#58a6ff", fontFamily: "monospace" }}>{short(address)}</span> is not whitelisted.
          </div>
          <div style={{ fontSize: 11, color: "#6e7681", marginBottom: 24 }}>Contact the superadmin to request access.</div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <ConnectButton />
          </div>
        </div>
      </div>
    );
  }

  // ── AUTHORIZED ────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#010409", color: "#e6edf3", fontFamily: "'IBM Plex Mono', monospace" }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid #21262d", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0d1117" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: "linear-gradient(135deg, #00FF88, #0052FF)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: "#000" }}>C</div>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "0.02em" }}>CASHLY</span>
          <span style={{ color: "#8b949e", fontSize: 11, background: "#161b22", border: "1px solid #30363d", borderRadius: 4, padding: "2px 7px" }}>ADMIN</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {lastRefresh && <span style={{ fontSize: 10, color: "#6e7681" }}>refreshed {fmtDate(lastRefresh)}</span>}
          {loading && <span style={{ fontSize: 11, color: "#00FF88" }}>● syncing…</span>}
          <button onClick={fetchData} style={{ background: "#161b22", border: "1px solid #30363d", color: "#8b949e", borderRadius: 5, padding: "4px 10px", cursor: "pointer", fontSize: 11 }}>Refresh</button>
          <span style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 4, padding: "2px 7px", color: "#58a6ff", fontSize: 11 }}>{role}</span>
          <ConnectButton accountStatus="address" chainStatus="none" showBalance={false} />
        </div>
      </div>

      {/* Nav */}
      <div style={{ borderBottom: "1px solid #21262d", padding: "0 28px", display: "flex", gap: 2, background: "#0d1117" }}>
        {[["overview","Overview"],["transactions","Transactions"],["users","Users"],["chains","Chains"],...(canAdmin ? [["admin","Admin"]] : [])].map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: "none", border: "none", cursor: "pointer",
            color: tab === t ? "#e6edf3" : "#8b949e",
            borderBottom: tab === t ? "2px solid #00FF88" : "2px solid transparent",
            padding: "12px 16px", fontSize: 13, fontWeight: tab === t ? 600 : 400,
          }}>{l}</button>
        ))}
      </div>

      {/* Controls */}
      <div style={{ padding: "16px 28px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid #21262d" }}>
        {["day","week","month","year","all"].map(p => (
          <button key={p} onClick={() => setPeriod(p)} style={{
            background: period === p ? "#00FF8822" : "none",
            border: `1px solid ${period === p ? "#00FF88" : "#30363d"}`,
            color: period === p ? "#00FF88" : "#8b949e",
            borderRadius: 5, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600, textTransform: "uppercase",
          }}>{p}</button>
        ))}
        <div style={{ flex: 1 }} />
        <select value={chainFilter} onChange={e => setChainFilter(e.target.value)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#e6edf3", borderRadius: 5, padding: "5px 10px", fontSize: 12 }}>
          <option value="all">All Chains</option>
          {Object.entries(CHAINS).filter(([id]) => Number(id) !== 8453).map(([id, c]) => (
            <option key={id} value={id}>{c.name}</option>
          ))}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search userId / tx / wallet…" style={{ background: "#161b22", border: "1px solid #30363d", color: "#e6edf3", borderRadius: 5, padding: "5px 12px", fontSize: 12, width: 240, outline: "none" }} />
      </div>

      {error && (
        <div style={{ background: "#f8514922", border: "1px solid #f85149", color: "#f85149", padding: "10px 28px", fontSize: 12 }}>
          Could not reach middleware: {error}. Make sure the server is running.
        </div>
      )}

      {!loading && !error && allTxs.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 28px", color: "#6e7681" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 14, marginBottom: 6 }}>No transactions yet</div>
          <div style={{ fontSize: 12 }}>Transactions will appear here once webhooks start firing.</div>
        </div>
      )}

      {(allTxs.length > 0 || loading) && (
        <div style={{ padding: "24px 28px" }}>
          {tab === "overview"     && <OverviewTab stats={{ totalVol, totalFees, confirmed, hypeVol, activeUsers, filteredCount: filtered.length }} chainVols={chainVols} dailyVol={dailyVol} recentTxs={filtered.slice(0, 8)} setSelectedTx={setSelectedTx} />}
          {tab === "transactions" && <TransactionsTab txs={filtered} setSelectedTx={setSelectedTx} />}
          {tab === "users"        && <UsersTab txs={filtered} setSelectedUser={setSelectedUser} />}
          {tab === "chains"       && <ChainsTab txs={filtered} />}
          {tab === "admin" && canAdmin && <AdminTab role={role} />}
        </div>
      )}

      {selectedTx   && <TxModal   tx={selectedTx}      onClose={() => setSelectedTx(null)} />}
      {selectedUser && <UserModal userId={selectedUser} txs={allTxs.filter(t => t.userId === selectedUser)} onClose={() => setSelectedUser(null)} />}
    </div>
  );
}

function OverviewTab({ stats, chainVols, dailyVol, recentTxs, setSelectedTx }) {
  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <StatCard label="Total Volume"   value={`$${fmt(stats.totalVol)}`}  sub={`${stats.filteredCount} transactions`} accent="#00FF88" />
        <StatCard label="Fees Collected" value={`$${fmt(stats.totalFees)}`} sub="5% of volume" accent="#58a6ff" />
        <StatCard label="Active Users"   value={stats.activeUsers}          sub="unique userIds" />
        <StatCard label="Success Rate"   value={`${((stats.confirmed / Math.max(stats.filteredCount,1))*100).toFixed(1)}%`} sub={`${stats.confirmed} confirmed`} accent="#3fb950" />
        <StatCard label="HYPE Volume"    value={`$${fmt(stats.hypeVol)}`}   sub="HyperEVM route" accent="#00FF88" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 10, padding: "18px 22px" }}>
          <div style={{ color: "#8b949e", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>14-Day Volume</div>
          <MiniBar data={dailyVol} color="#00FF88" />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, color: "#6e7681", fontSize: 10 }}>
            <span>{dailyVol[0]?.label}</span><span>Today</span>
          </div>
        </div>
        <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 10, padding: "18px 22px" }}>
          <div style={{ color: "#8b949e", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Volume by Source Chain</div>
          {chainVols.slice(0, 6).map(([chainId, vol]) => {
            const c = CHAINS[chainId];
            const pct = (vol / (chainVols[0]?.[1] || 1)) * 100;
            return (
              <div key={chainId} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <ChainBadge chainId={Number(chainId)} small />
                  <span style={{ fontSize: 11, color: "#8b949e" }}>${fmt(vol)}</span>
                </div>
                <div style={{ height: 3, background: "#21262d", borderRadius: 2 }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: c?.color || "#888", borderRadius: 2 }} />
                </div>
              </div>
            );
          })}
          {chainVols.length === 0 && <div style={{ color: "#6e7681", fontSize: 12 }}>No data for selected period</div>}
        </div>
      </div>
      <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 10, padding: "18px 22px" }}>
        <div style={{ color: "#8b949e", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Recent Transactions</div>
        <TxTable txs={recentTxs} setSelectedTx={setSelectedTx} />
      </div>
    </div>
  );
}

function TransactionsTab({ txs, setSelectedTx }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 10, padding: "18px 22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ color: "#8b949e", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>All Transactions</div>
        <span style={{ color: "#6e7681", fontSize: 12 }}>{txs.length} results</span>
      </div>
      <TxTable txs={txs} setSelectedTx={setSelectedTx} />
    </div>
  );
}

function TxTable({ txs, setSelectedTx }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ color: "#6e7681", borderBottom: "1px solid #21262d" }}>
            {["Time","User","From","To","Token","Amount","Fee","Forwarded","Route","Status"].map(h => (
              <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {txs.map(tx => (
            <tr key={tx.id} onClick={() => setSelectedTx(tx)}
              style={{ borderBottom: "1px solid #161b22", cursor: "pointer" }}
              onMouseEnter={e => e.currentTarget.style.background = "#161b22"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <td style={{ padding: "8px 10px", color: "#8b949e", whiteSpace: "nowrap" }}>{fmtDate(tx.timestamp)}</td>
              <td style={{ padding: "8px 10px", color: "#58a6ff", fontFamily: "monospace" }}>{tx.userId?.slice(0,16)}…</td>
              <td style={{ padding: "8px 10px" }}><ChainBadge chainId={tx.sourceChain} small /></td>
              <td style={{ padding: "8px 10px" }}><ChainBadge chainId={tx.destChain} small /></td>
              <td style={{ padding: "8px 10px", color: tx.token === "HYPE" ? "#00FF88" : "#e6edf3" }}>{tx.token}</td>
              <td style={{ padding: "8px 10px", color: "#e6edf3", fontFamily: "monospace" }}>${fmt(tx.amount)}</td>
              <td style={{ padding: "8px 10px", color: "#f85149", fontFamily: "monospace" }}>${fmt(tx.fee)}</td>
              <td style={{ padding: "8px 10px", color: "#3fb950", fontFamily: "monospace" }}>${fmt(tx.forwarded)}</td>
              <td style={{ padding: "8px 10px", color: "#8b949e", fontSize: 11 }}>{tx.route}</td>
              <td style={{ padding: "8px 10px" }}>
                <span style={{ color: tx.status === "confirmed" ? "#3fb950" : "#f85149", fontWeight: 600, fontSize: 11 }}>
                  {tx.status === "confirmed" ? "✓" : "✗"} {tx.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {txs.length === 0 && <div style={{ color: "#6e7681", textAlign: "center", padding: 32 }}>No transactions found</div>}
    </div>
  );
}

function UsersTab({ txs, setSelectedUser }) {
  const userStats = useMemo(() => {
    const map = {};
    txs.forEach(t => {
      if (!map[t.userId]) map[t.userId] = { userId: t.userId, wallet: t.userWallet, baseDeposit: t.baseDepositAddress, totalVol: 0, totalFees: 0, txCount: 0, chains: new Set(), lastSeen: null };
      const u = map[t.userId];
      u.totalVol += t.amount; u.totalFees += t.fee; u.txCount++;
      u.chains.add(t.sourceChain);
      if (!u.lastSeen || new Date(t.timestamp) > u.lastSeen) u.lastSeen = new Date(t.timestamp);
    });
    return Object.values(map).sort((a, b) => b.totalVol - a.totalVol);
  }, [txs]);

  return (
    <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 10, padding: "18px 22px" }}>
      <div style={{ color: "#8b949e", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Users — {userStats.length} active</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ color: "#6e7681", borderBottom: "1px solid #21262d" }}>
              {["User ID","Wallet","Base Deposit","Txns","Volume","Fees","Chains","Last Seen"].map(h => (
                <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {userStats.map(u => (
              <tr key={u.userId} onClick={() => setSelectedUser(u.userId)}
                style={{ borderBottom: "1px solid #161b22", cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.background = "#161b22"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <td style={{ padding: "8px 10px", color: "#58a6ff", fontFamily: "monospace" }}>{u.userId?.slice(0,20)}…</td>
                <td style={{ padding: "8px 10px", color: "#8b949e", fontFamily: "monospace" }}>{short(u.wallet)}</td>
                <td style={{ padding: "8px 10px", color: "#8b949e", fontFamily: "monospace" }}>{short(u.baseDeposit)}</td>
                <td style={{ padding: "8px 10px", color: "#e6edf3" }}>{u.txCount}</td>
                <td style={{ padding: "8px 10px", color: "#e6edf3", fontFamily: "monospace" }}>${fmt(u.totalVol)}</td>
                <td style={{ padding: "8px 10px", color: "#f85149", fontFamily: "monospace" }}>${fmt(u.totalFees)}</td>
                <td style={{ padding: "8px 10px" }}>
                  <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                    {[...u.chains].map(c => <ChainBadge key={c} chainId={c} small />)}
                  </div>
                </td>
                <td style={{ padding: "8px 10px", color: "#8b949e" }}>{u.lastSeen ? fmtDate(u.lastSeen) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {userStats.length === 0 && <div style={{ color: "#6e7681", textAlign: "center", padding: 32 }}>No users found</div>}
      </div>
    </div>
  );
}

function ChainsTab({ txs }) {
  const chainStats = useMemo(() => {
    const map = {};
    txs.forEach(t => {
      if (!map[t.sourceChain]) map[t.sourceChain] = { chainId: t.sourceChain, vol: 0, fees: 0, txCount: 0, users: new Set() };
      map[t.sourceChain].vol += t.amount;
      map[t.sourceChain].fees += t.fee;
      map[t.sourceChain].txCount++;
      map[t.sourceChain].users.add(t.userId);
    });
    return Object.values(map).sort((a, b) => b.vol - a.vol);
  }, [txs]);

  const totalVol = chainStats.reduce((s, c) => s + c.vol, 0);

  if (chainStats.length === 0) return <div style={{ color: "#6e7681", textAlign: "center", padding: 60, fontSize: 14 }}>No chain data for selected period</div>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
      {chainStats.map(c => {
        const chain = CHAINS[c.chainId] || { name: String(c.chainId), color: "#888", icon: "?" };
        const pct = ((c.vol / totalVol) * 100).toFixed(1);
        return (
          <div key={c.chainId} style={{ background: "#0d1117", border: `1px solid ${chain.color}33`, borderRadius: 10, padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: chain.color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: chain.color }}>{chain.icon}</div>
              <div>
                <div style={{ fontWeight: 700, color: "#e6edf3" }}>{chain.name}</div>
                <div style={{ fontSize: 11, color: "#6e7681" }}>Chain ID: {c.chainId}</div>
              </div>
              <div style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: chain.color }}>{pct}%</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[["Volume",`$${fmt(c.vol)}`,"#e6edf3"],["Fees",`$${fmt(c.fees)}`,"#f85149"],["Transactions",c.txCount,"#58a6ff"],["Unique Users",c.users.size,"#3fb950"]].map(([l,v,col]) => (
                <div key={l} style={{ background: "#161b22", borderRadius: 6, padding: "10px 12px" }}>
                  <div style={{ color: "#6e7681", fontSize: 10, textTransform: "uppercase", marginBottom: 4 }}>{l}</div>
                  <div style={{ color: col, fontWeight: 700, fontFamily: "monospace" }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, height: 3, background: "#21262d", borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: chain.color, borderRadius: 2 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AdminTab({ role }) {
  const [wallets, setWallets] = useState(WHITELIST);
  const [newAddr, setNewAddr] = useState("");
  const [newRole, setNewRole] = useState("viewer");

  const addWallet = () => {
    if (!newAddr.startsWith("0x") || newAddr.length < 10) return;
    setWallets(w => [...w, { address: newAddr, role: newRole, label: "New Wallet" }]);
    setNewAddr("");
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 10, padding: "20px 22px" }}>
        <div style={{ color: "#8b949e", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>Whitelisted Wallets</div>
        {wallets.map((w, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #161b22" }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#58a6ff", fontSize: 12, fontFamily: "monospace" }}>{short(w.address)}</div>
              <div style={{ color: "#6e7681", fontSize: 11 }}>{w.label}</div>
            </div>
            <span style={{ background: w.role === "superadmin" ? "#00FF8822" : w.role === "admin" ? "#58a6ff22" : "#8b949e22", color: w.role === "superadmin" ? "#00FF88" : w.role === "admin" ? "#58a6ff" : "#8b949e", border: "1px solid currentColor", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>{w.role}</span>
            {role === "superadmin" && w.role !== "superadmin" && (
              <button onClick={() => setWallets(ws => ws.filter((_,j) => j !== i))} style={{ background: "#f8514922", border: "1px solid #f85149", color: "#f85149", borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: 11 }}>Remove</button>
            )}
          </div>
        ))}
        {role === "superadmin" && (
          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <input value={newAddr} onChange={e => setNewAddr(e.target.value)} placeholder="0x… address" style={{ flex: 1, background: "#161b22", border: "1px solid #30363d", color: "#e6edf3", borderRadius: 5, padding: "6px 10px", fontSize: 12, outline: "none", fontFamily: "monospace" }} />
            <select value={newRole} onChange={e => setNewRole(e.target.value)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#e6edf3", borderRadius: 5, padding: "6px 8px", fontSize: 12 }}>
              <option value="viewer">viewer</option>
              <option value="admin">admin</option>
            </select>
            <button onClick={addWallet} style={{ background: "#00FF8822", border: "1px solid #00FF88", color: "#00FF88", borderRadius: 5, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Add</button>
          </div>
        )}
      </div>
      <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 10, padding: "20px 22px" }}>
        <div style={{ color: "#8b949e", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>System Info</div>
        {[
          ["Fee Vault",            "0x749edFC84A28793ce150d4E7E71bcEe73C454b56"],
          ["Deployer",             "0x27FbEAD2B527AaDAf4EA7B3Af065244A3964ECBC"],
          ["OFTAdapter (Base)",    "0xA150EC8B718C22E12036f916d90FF72af14B3E96"],
          ["MyOFT (Arbitrum)",     "0xCf06b8A18b49c6b26b11426F8Cd9d697ba714134"],
          ["Owen's Base Contract", "0x34e81c59B814874611C7FB66661B57E599b4857D"],
          ["Fee Rate",             "5%"],
          ["LZ Endpoint Base",     "30184"],
          ["Admin Key Env",        "ADMIN_KEY"],
        ].map(([l,v]) => (
          <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #161b22", gap: 12 }}>
            <span style={{ color: "#6e7681", fontSize: 11 }}>{l}</span>
            <span style={{ color: "#8b949e", fontSize: 11, fontFamily: "monospace" }}>{v.startsWith("0x") ? short(v) : v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TxModal({ tx, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#00000099", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, fontFamily: "'IBM Plex Mono', monospace" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 14, padding: 28, width: 520, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Transaction Detail</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#8b949e", cursor: "pointer", fontSize: 18 }}>×</button>
        </div>
        {[
          ["Tx Hash",              tx.txHash ? short(tx.txHash) : "pending"],
          ["Time",                 fmtDate(tx.timestamp)],
          ["User ID",              tx.userId],
          ["User Wallet",          short(tx.userWallet)],
          ["Base Deposit Address", short(tx.baseDepositAddress)],
          ["Source Chain",         null],
          ["Destination Chain",    null],
          ["Token",                tx.token],
          ["Amount",               `$${fmt(tx.amount)}`],
          ["Fee (5%)",             `$${fmt(tx.fee)}`],
          ["Forwarded",            `$${fmt(tx.forwarded)}`],
          ["Route",                tx.route],
          ["Status",               tx.status],
        ].map(([label, value]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #161b22", alignItems: "center" }}>
            <span style={{ color: "#6e7681", fontSize: 12 }}>{label}</span>
            <span style={{ color: "#e6edf3", fontSize: 12, fontFamily: "monospace" }}>
              {label === "Source Chain"      ? <ChainBadge chainId={tx.sourceChain} small /> :
               label === "Destination Chain" ? <ChainBadge chainId={tx.destChain}   small /> :
               label === "Status"            ? <span style={{ color: tx.status === "confirmed" ? "#3fb950" : "#f85149" }}>{value}</span> :
               value}
            </span>
          </div>
        ))}
        {tx.txHash && (
          <a href={`https://basescan.org/tx/${tx.txHash}`} target="_blank" rel="noopener noreferrer"
            style={{ display: "block", marginTop: 16, textAlign: "center", color: "#58a6ff", fontSize: 12 }}>
            View on Basescan ↗
          </a>
        )}
      </div>
    </div>
  );
}

function UserModal({ userId, txs, onClose }) {
  const totalVol  = txs.reduce((s, t) => s + t.amount, 0);
  const totalFees = txs.reduce((s, t) => s + t.fee, 0);
  const chains    = [...new Set(txs.map(t => t.sourceChain))];
  const user      = txs[0];

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#00000099", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, fontFamily: "'IBM Plex Mono', monospace" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 14, padding: 28, width: 580, maxWidth: "95vw", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>User Profile</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#8b949e", cursor: "pointer", fontSize: 18 }}>×</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          <StatCard label="Total Volume"  value={`$${fmt(totalVol)}`}  accent="#00FF88" />
          <StatCard label="Fees Paid"     value={`$${fmt(totalFees)}`} accent="#f85149" />
          <StatCard label="Transactions"  value={txs.length} />
          <StatCard label="Chains Used"   value={chains.length} />
        </div>
        {user && (
          <div style={{ marginBottom: 16 }}>
            {[["User ID", userId],["Wallet", short(user.userWallet)],["Base Deposit", short(user.baseDepositAddress)]].map(([l,v]) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #161b22" }}>
                <span style={{ color: "#6e7681", fontSize: 12 }}>{l}</span>
                <span style={{ color: "#8b949e", fontSize: 12, fontFamily: "monospace" }}>{v}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ color: "#8b949e", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Transaction History</div>
        <div style={{ maxHeight: 280, overflowY: "auto" }}>
          {txs.map(tx => (
            <div key={tx.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #161b22", fontSize: 12 }}>
              <span style={{ color: "#8b949e" }}>{fmtDate(tx.timestamp)}</span>
              <ChainBadge chainId={tx.sourceChain} small />
              <span style={{ color: "#e6edf3", fontFamily: "monospace" }}>${fmt(tx.amount)}</span>
              <span style={{ color: "#f85149", fontFamily: "monospace" }}>-${fmt(tx.fee)}</span>
              <span style={{ color: tx.status === "confirmed" ? "#3fb950" : "#f85149", fontWeight: 600 }}>{tx.status === "confirmed" ? "✓" : "✗"}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
