/**
 * 极简内存版 Redis，仅覆盖本仓单测所需命令。
 * 关键作用：统计"往返次数"（每个直接命令 +1，每个 pipeline exec 计 +1），
 * 用以断言批量改造后往返数不随数据量 N 线性增长。
 */
export class FakeRedis {
  private hashes = new Map<string, Map<string, string>>();
  private sets = new Map<string, Set<string>>();
  private zsets = new Map<string, Map<string, number>>();
  private strings = new Map<string, string>();
  /** 往返计数：直接命令与每次 pipeline exec 各计一次 */
  roundTrips = 0;

  // —— 播种辅助（不计往返）——
  seedHash(key: string, obj: Record<string, string>): void {
    this.hashes.set(key, new Map(Object.entries(obj)));
  }
  seedSet(key: string, members: string[]): void {
    this.sets.set(key, new Set(members));
  }
  seedZset(key: string, entries: Array<[string, number]>): void {
    this.zsets.set(key, new Map(entries));
  }

  // —— 命令实现（内部执行，供直接调用与 pipeline 复用）——
  private _hgetall(key: string): Record<string, string> {
    const h = this.hashes.get(key);
    return h ? Object.fromEntries(h) : {};
  }
  private _hget(key: string, field: string): string | null {
    return this.hashes.get(key)?.get(field) ?? null;
  }
  private _smembers(key: string): string[] {
    return [...(this.sets.get(key) ?? [])];
  }
  private _zrangebyscore(key: string, min: number, max: number, limit?: number): string[] {
    const z = this.zsets.get(key);
    if (!z) return [];
    let arr = [...z.entries()]
      .filter(([, s]) => s >= min && (max === Infinity || s <= max))
      .sort((a, b) => a[1] - b[1])
      .map(([m]) => m);
    if (limit !== undefined) arr = arr.slice(0, limit);
    return arr;
  }
  private _zcount(key: string, min: number, max: number): number {
    const z = this.zsets.get(key);
    if (!z) return 0;
    return [...z.values()].filter((s) => s >= min && (max === Infinity || s <= max)).length;
  }
  private _eval(script: string, key: string, arg: string): number {
    // 仅支持弹幕限流脚本语义：incr + 首次 expire（内存版忽略 TTL）
    void script;
    void arg;
    const cur = Number(this.strings.get(key) ?? "0") + 1;
    this.strings.set(key, String(cur));
    return cur;
  }

  private norm(v: string | number): number {
    if (v === "+inf") return Infinity;
    if (v === "-inf") return -Infinity;
    return Number(v);
  }

  // —— 直接命令（各计一次往返）——
  async hgetall(key: string): Promise<Record<string, string>> {
    this.roundTrips++;
    return this._hgetall(key);
  }
  async smembers(key: string): Promise<string[]> {
    this.roundTrips++;
    return this._smembers(key);
  }
  async zrangebyscore(key: string, min: string | number, max: string | number, ..._rest: unknown[]): Promise<string[]> {
    this.roundTrips++;
    // 形如 (key, min, max, "LIMIT", 0, count)
    const limit = _rest[0] === "LIMIT" ? Number(_rest[2]) : undefined;
    return this._zrangebyscore(key, this.norm(min), this.norm(max), limit);
  }
  async zcount(key: string, min: string | number, max: string | number): Promise<number> {
    this.roundTrips++;
    return this._zcount(key, this.norm(min), this.norm(max));
  }
  async eval(script: string, _numKeys: number, key: string, arg: string): Promise<number> {
    this.roundTrips++;
    return this._eval(script, key, arg);
  }

  // —— pipeline：整批只计一次往返 ——
  pipeline(): FakePipeline {
    return new FakePipeline(this);
  }

  // 供 pipeline 回调用（不单独计往返，由 exec 统一 +1）
  _exec(cmds: Array<{ m: string; args: unknown[] }>): Array<[Error | null, unknown]> {
    this.roundTrips++;
    return cmds.map(({ m, args }) => {
      switch (m) {
        case "hgetall":
          return [null, this._hgetall(args[0] as string)];
        case "hget":
          return [null, this._hget(args[0] as string, args[1] as string)];
        case "smembers":
          return [null, this._smembers(args[0] as string)];
        default:
          return [null, null];
      }
    });
  }
}

class FakePipeline {
  private cmds: Array<{ m: string; args: unknown[] }> = [];
  constructor(private readonly r: FakeRedis) {}
  hgetall(...args: unknown[]): this {
    this.cmds.push({ m: "hgetall", args });
    return this;
  }
  hget(...args: unknown[]): this {
    this.cmds.push({ m: "hget", args });
    return this;
  }
  smembers(...args: unknown[]): this {
    this.cmds.push({ m: "smembers", args });
    return this;
  }
  async exec(): Promise<Array<[Error | null, unknown]>> {
    return this.r._exec(this.cmds);
  }
}

/** 复刻 common/redis.ts 的 redisPipeline：剔除错误层，仅返回值数组 */
export function makeRedisPipeline(r: FakeRedis) {
  return async <T = unknown>(fn: (p: FakePipeline) => void): Promise<T[]> => {
    const p = r.pipeline();
    fn(p);
    const result = await p.exec();
    return result.map(([err, value]) => {
      if (err) throw err;
      return value as T;
    });
  };
}
