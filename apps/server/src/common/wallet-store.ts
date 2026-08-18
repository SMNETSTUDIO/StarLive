import type { TransactionType } from "@starlive/shared";
import { Keys } from "@starlive/shared";
import { redis, redisPipeline } from "./redis";
import { genId } from "./audit";

export interface BalanceRecord {
  coins: number;
  totalRecharged: number;
  totalWithdrawn: number;
  frozenCoins: number;
}

export async function getBalance(userId: string): Promise<BalanceRecord> {
  const raw = await redis().hgetall(Keys.userBalance(userId));
  return {
    coins: Number(raw.coins ?? 0),
    totalRecharged: Number(raw.total_recharged ?? 0),
    totalWithdrawn: Number(raw.total_withdrawn ?? 0),
    frozenCoins: Number(raw.frozen_coins ?? 0),
  };
}

export interface BalanceDelta {
  coins?: number;
  totalRecharged?: number;
  totalWithdrawn?: number;
  frozenCoins?: number;
}

/** 原子增减余额字段 */
export async function applyBalanceDelta(
  userId: string,
  delta: BalanceDelta,
): Promise<void> {
  const r = redis();
  const key = Keys.userBalance(userId);
  const fieldMap: Record<string, string> = {
    coins: "coins",
    totalRecharged: "total_recharged",
    totalWithdrawn: "total_withdrawn",
    frozenCoins: "frozen_coins",
  };
  const pipe = r.pipeline();
  for (const [k, v] of Object.entries(delta)) {
    if (!v) continue;
    pipe.hincrbyfloat(key, fieldMap[k], v);
  }
  await pipe.exec();
}

export async function addTransaction(
  userId: string,
  type: TransactionType,
  amount: number,
  balanceAfter: number,
  meta?: string,
): Promise<string> {
  const txId = genId("tx_");
  await redisPipeline((p) => {
    p.hset(Keys.userTransaction(userId, txId), {
      id: txId,
      userId,
      type,
      amount: String(amount),
      balanceAfter: String(balanceAfter),
      meta: meta ?? "",
      ts: String(Date.now()),
    });
    p.zadd(Keys.userTransactionsIndex(userId), Date.now(), txId);
  });
  return txId;
}

export async function listTransactions(
  userId: string,
  limit = 50,
): Promise<Record<string, string>[]> {
  const ids = await redis().zrevrange(Keys.userTransactionsIndex(userId), 0, limit - 1);
  if (ids.length === 0) return [];
  const results = await redisPipeline<Record<string, string>>((p) => {
    for (const id of ids) p.hgetall(Keys.userTransaction(userId, id));
  });
  return results.filter((r) => r && r.id);
}
