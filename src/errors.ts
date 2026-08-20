/** exit 2: 使い方の誤り */
export class UsageError extends Error {
  readonly exitCode = 2;
}

/** exit 1: ネットワーク・GitHub・認証の失敗 */
export class GhError extends Error {
  readonly exitCode = 1;
}

/** exit 3: 不変条件違反(ガードで実行を拒否する場合にも使う) */
export class InvariantError extends Error {
  readonly exitCode = 3;
}

/** exit 4: 事後条件違反。書込は成功したが再分類が約束と一致しない */
export class PostConditionError extends Error {
  readonly exitCode = 4;
  readonly expected: unknown;
  readonly actual: unknown;
  constructor(expected: unknown, actual: unknown) {
    super("post-condition-failed");
    this.expected = expected;
    this.actual = actual;
  }
}
