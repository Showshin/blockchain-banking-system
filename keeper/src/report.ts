import { formatUnits } from "ethers";
import { DEPOSIT_STATUS, type DepositSnapshot, type ScanResult } from "./keeper.ts";

const COLOR = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

const paint = (code: string, text: string): string => (COLOR ? `\u001b[${code}m${text}\u001b[0m` : text);
const dim = (text: string): string => paint("2", text);
const bold = (text: string): string => paint("1", text);
const green = (text: string): string => paint("32", text);
const amber = (text: string): string => paint("33", text);

export function usdc(baseUnits: bigint): string {
  return `${formatUnits(baseUnits, 6)} USDC`;
}

export function eth(wei: bigint): string {
  return `${formatUnits(wei, 18)} ETH`;
}

export function isoFromChainSeconds(seconds: bigint): string {
  return new Date(Number(seconds) * 1000).toISOString();
}

/** Amount in USDC with grouping; tiny interest values keep six decimals instead of rounding to 0.00. */
export function amountText(baseUnits: bigint): string {
  const value = Number(formatUnits(baseUnits, 6));
  const digits = value !== 0 && Math.abs(value) < 1 ? 6 : 2;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function stampTime(seconds: bigint): string {
  const date = new Date(Number(seconds) * 1000);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
}

/** Remaining time until a chain timestamp, e.g. "2d 05h", "07h 12m", "sẵn sàng". */
export function countdown(target: bigint, now: bigint): string {
  if (now >= target) return "sẵn sàng";
  const total = Number(target - now);
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  if (days > 0) return `${days}d ${String(hours).padStart(2, "0")}h`;
  if (hours > 0) return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}m`;
}

const CLOSED_LABEL: Record<string, string> = {
  [String(DEPOSIT_STATUS.withdrawn)]: "đã tất toán",
  [String(DEPOSIT_STATUS.manualRenewed)]: "đã tái gửi",
  [String(DEPOSIT_STATUS.autoRenewed)]: "auto-renew",
  [String(DEPOSIT_STATUS.principalWithdrawn)]: "chờ lãi",
};

function statusLabel(entry: DepositSnapshot, scan: ScanResult): string {
  if (entry.status === DEPOSIT_STATUS.active) {
    return scan.now >= entry.eligibleAt ? "tới hạn" : "đang chờ";
  }
  return CLOSED_LABEL[String(entry.status)] ?? `status ${entry.status}`;
}

type Column = { title: string; width: number; align: "start" | "end" };

const COLUMNS: Column[] = [
  { title: "ID", width: 4, align: "end" },
  { title: "Gói", width: 4, align: "end" },
  { title: "Gốc (USDC)", width: 12, align: "end" },
  { title: "Lãi (USDC)", width: 11, align: "end" },
  { title: "Trạng thái", width: 12, align: "start" },
  { title: "Đáo hạn", width: 12, align: "start" },
  { title: "Renew từ", width: 12, align: "start" },
  { title: "Còn lại", width: 10, align: "start" },
];

const GAP = "  ";

function pad(value: string, column: Column): string {
  const clipped = value.length > column.width ? `${value.slice(0, column.width - 1)}…` : value;
  return column.align === "end" ? clipped.padStart(column.width) : clipped.padEnd(column.width);
}

function assemble(cells: string[]): string {
  return cells.map((cell, index) => pad(cell, COLUMNS[index]!)).join(GAP).trimEnd();
}

function tableWidth(): number {
  return COLUMNS.reduce((sum, column) => sum + column.width, 0) + GAP.length * (COLUMNS.length - 1);
}

function totalPrincipal(entries: DepositSnapshot[]): bigint {
  return entries.reduce((sum, entry) => sum + entry.principal, 0n);
}

function entryLine(entry: DepositSnapshot, scan: ScanResult): string {
  const eligible = entry.status === DEPOSIT_STATUS.active && scan.now >= entry.eligibleAt;
  const active = entry.status === DEPOSIT_STATUS.active;
  const text = assemble([
    `#${entry.id}`,
    String(entry.planId),
    amountText(entry.principal),
    amountText(entry.interest),
    statusLabel(entry, scan),
    stampTime(entry.maturityAt),
    active ? stampTime(entry.eligibleAt) : "—",
    active ? countdown(entry.eligibleAt, scan.now) : "—",
  ]);
  if (eligible) return green(text);
  if (!active) return dim(text);
  return text;
}

export function renderScan(scan: ScanResult): string {
  const parts: string[] = [];
  const ready = scan.eligible.length;
  const closed = scan.closed.length;

  parts.push(
    `${bold(`${scan.active.length} sổ đang mở`)}` +
      (ready > 0 ? ` · ${green(`${ready} tới hạn`)}` : " · 0 tới hạn") +
      (closed > 0 ? ` · ${closed} đã đóng` : "") +
      ` · tổng gốc ${amountText(totalPrincipal(scan.active))} USDC`,
  );
  parts.push(
    dim(
      `chain ${isoFromChainSeconds(scan.now).slice(0, 19).replace("T", " ")} UTC · ` +
        `vault ${amountText(scan.vaultBalance)} USDC (đã hứa ${amountText(scan.reservedInterest)} USDC) · ` +
        `${scan.callsUsed} eth_call${scan.viaMulticall ? " (multicall)" : ""}`,
    ),
  );

  if (scan.paused) {
    parts.push(amber("vault đang pause: mọi lệnh renew sẽ revert"));
  }

  parts.push("");
  if (scan.active.length === 0) {
    parts.push(dim("không có sổ nào đang mở"));
  } else {
    parts.push(dim(assemble(COLUMNS.map((column) => column.title))));
    parts.push(dim("─".repeat(tableWidth())));
    for (const entry of [...scan.eligible, ...scan.pending]) {
      parts.push(entryLine(entry, scan));
    }
  }

  if (closed > 0) {
    const closedText = scan.closed.map((entry) => `#${entry.id} ${statusLabel(entry, scan)}`).join(", ");
    parts.push("");
    parts.push(dim(`đã đóng: ${closedText}`));
  }

  return parts.join("\n");
}

/** Plain fallback for piped output and log files. */
export function renderScanPlain(scan: ScanResult): string {
  const parts = [
    `scan: ${scan.total} deposits, ${scan.active.length} active, ${scan.terminal} terminal, ` +
      `${scan.eligible.length} eligible, ${scan.pending.length} waiting ` +
      `(${scan.callsUsed} eth_call${scan.viaMulticall ? ", multicall" : ""})`,
    `chain time ${isoFromChainSeconds(scan.now)}; grace ${scan.gracePeriod}s; ` +
      `vault ${usdc(scan.vaultBalance)} (reserved ${usdc(scan.reservedInterest)})`,
  ];
  if (scan.paused) parts.push("vault is paused: every renewal would revert");
  for (const entry of scan.pending) {
    parts.push(
      `waiting #${entry.id}: plan ${entry.planId}, ${usdc(entry.principal)}, ` +
        `eligible at ${isoFromChainSeconds(entry.eligibleAt)}`,
    );
  }
  return parts.join("\n");
}
