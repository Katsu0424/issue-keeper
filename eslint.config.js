// サイズ・複雑度・構造の上限だけを機械に拒否させる専用 ESLint(実体は lint-gate)。
// フォーマットと一般 lint は Biome が担う(ルールの重複なし)。
import { createConfig } from "lint-gate";

export default createConfig({
  tsconfigRootDir: import.meta.dirname,
  // domain 層は純関数のみ(src/domain/ への I/O・外側レイヤ import を拒否)
  layers: {},
});
