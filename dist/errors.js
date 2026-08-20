/** exit 2: 使い方の誤り */
export class UsageError extends Error {
    exitCode = 2;
}
/** exit 1: ネットワーク・GitHub・認証の失敗 */
export class GhError extends Error {
    exitCode = 1;
}
/** exit 3: 不変条件違反(ガードで実行を拒否する場合にも使う) */
export class InvariantError extends Error {
    exitCode = 3;
}
/** exit 4: 事後条件違反。書込は成功したが再分類が約束と一致しない */
export class PostConditionError extends Error {
    exitCode = 4;
    expected;
    actual;
    constructor(expected, actual) {
        super("post-condition-failed");
        this.expected = expected;
        this.actual = actual;
    }
}
