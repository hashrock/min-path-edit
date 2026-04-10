# min-path-edit 仕様書

SVG ベジェ曲線パスエディタ。React + TypeScript で構築。

## データモデル

### Point

```typescript
interface Point {
  x: number;
  y: number;
}
```

### Segment（アンカーポイント）

```typescript
interface Segment extends Point {
  out: Point | null;  // 前方制御ハンドル
  in: Point | null;   // 後方制御ハンドル
  mirror: boolean;    // ハンドルの対称移動モード
}
```

- `in` / `out` はアンカーポイントからの相対座標ではなく、SVG 上の絶対座標
- 開いたパス（`closed = false`）では、最初のポイントは `in = null`、最後のポイントは `out = null`
- 閉じたパス（`closed = true`）では、始点と終点も通常のセグメントとして扱い、`in` / `out` を保持できる
- `mirror = true` がデフォルト

### Path

```typescript
interface Path {
  points: Segment[];
  closed: boolean;
}
```

## SVG パス出力

`toSvg()` 関数がパスデータを SVG パス文字列に変換する。

- `M x y` — 始点への移動
- `C cx1 cy1, cx2 cy2, x y` — 三次ベジェ曲線（各セグメント間、および閉路の最後→最初）
- `Z` — パスを閉じる（`closed = true` の場合）

ハンドルが `null` の場合はアンカーポイント座標がフォールバックとして使われる。

- `points.length === 0` の場合は空文字列 `""` を返す
- `points.length === 1` の場合は `M x y` のみを返す
- `closed = false` の場合は `points[i] -> points[i + 1]` を順に `C` で出力する
- `closed = true` の場合は上記に加えて `last -> first` を `C` で出力し、最後に `Z` を付与する

## キャンバス

- SVG viewBox: `0 0 400 400`
- グリッド: 20px 間隔のドットパターン

## ステートマシン

### 状態変数

| 変数 | 型 | 初期値 | 説明 |
|---|---|---|---|
| `paths` | `Path[]` | 空パス1つ | 全レイヤー |
| `selectedPathIndex` | `number` | `0` | アクティブレイヤーのインデックス |
| `penMode` | `boolean` | `true` | パス作成モード |
| `selection` | `Point \| Segment \| null` | `null` | ドラッグ中のポイント |
| `selectedSegment` | `Segment \| null` | `null` | 選択中のアンカーポイント |
| `selectedType` | `"out" \| "in" \| ""` | `""` | 選択対象の種別 |
| `offset` | `Offset \| null` | `null` | ドラッグのオフセット座標 |
| `anchorChange` | `boolean` | `false` | Ctrl/Cmd/Z によりミラーモード反転が要求されているか |
| `anchorChangeUsed` | `boolean` | `false` | 現在のドラッグ中に一度でも anchorChange が使われたか |
| `snapToGrid` | `boolean` | `true` | グリッドスナップ有効 |
| `gridSize` | `number` | `20` | グリッドサイズ（px） |

### モード遷移

```
[起動] → penMode: true（パス作成モード）

penMode: true
  │
  ├─ キャンバスクリック → ポイント追加（penMode 維持）
  │
  └─ 最初のアンカーをクリック → パスを閉じる → penMode: false（編集モード）

penMode: false（編集モード）
  │
  ├─ ツールバーの Pen ボタン → アクティブパスが閉じている場合のみ penMode: true
  │
  └─ Add Path ボタン → 新パス追加 → penMode: true
```

### ドラッグ操作のライフサイクル

```
pointerdown
  │  offset を記録、setPointerCapture
  │  selection / selectedSegment / selectedType を設定
  │  anchorChangeUsed = false
  ▼
pointermove（繰り返し）
  │  スクリーン座標 → SVG座標変換
  │  グリッドスナップ適用
  │  movingGroup 内の全ポイントを移動
  │  ミラーハンドルの反映
  │  anchorChange が有効なら anchorChangeUsed = true
  ▼
pointerup
  │  offset = null（ドラッグ終了）
  │  anchorChangeUsed が true なら mirror を反転
  │  anchorChangeUsed = false
  ▼
[待機状態]
```

## キー操作

| キー | 動作 |
|---|---|
| **Ctrl**（Windows/Linux） | 押下中: `anchorChange = true`。ハンドルのミラーモードを一時的に反転させる |
| **Cmd**（macOS） | 同上 |
| **Z** | SVG にフォーカス時のみ。押下中: `anchorChange = true` |

### anchorChange の効果

ドラッグ中に効果を発揮する:

- **`mirror = true` のセグメント**: 通常はハンドルが対称に連動する。Ctrl/Cmd を押すとミラーを**解除**し、片方だけ動かせる
- **`mirror = false` のセグメント**: 通常はハンドルが独立。Ctrl/Cmd を押すとミラーを**有効化**し、対称に連動する

- ハンドルをドラッグしている間に一度でも `anchorChange = true` になった場合、`anchorChangeUsed = true` とする
- `pointerup` 時に `anchorChangeUsed = true` であれば、`selectedSegment.mirror` を反転（トグル）する
- `pointerup` の瞬間にキーが押されているかどうかではなく、そのドラッグ中に一度でも反転操作を使ったかで確定する

## マウス操作

### ペンモード（`penMode: true`）

| 操作 | 動作 |
|---|---|
| キャンバスを `pointerdown` | 新しいアンカーポイントを作成。作成直後にその `out` ハンドルが選択状態になり、同じポインタ操作を継続してドラッグ調整できる |
| 最初のアンカーを `pointerdown` | パスを閉じる（`closed = true`）。最初のアンカーの `out` ハンドルを選択状態にし、同じポインタ操作を継続してドラッグ調整できる。`pointerup` 後にペンモード終了 |

### 編集モード（`penMode: false`）

| 操作 | 動作 |
|---|---|
| アンカーポイントをドラッグ | アンカーと付属ハンドル（`in`, `out`）が一体で移動する |
| `out` ハンドルをドラッグ | `out` ハンドルのみ移動。`mirror = true` なら `in` ハンドルも対称移動 |
| `in` ハンドルをドラッグ | `in` ハンドルのみ移動。`mirror = true` なら `out` ハンドルも対称移動 |
| Ctrl/Cmd + ハンドルドラッグ | ミラーモードを一時的に反転してドラッグ |
| レイヤーサムネイルをクリック | アクティブレイヤーを切り替え（ペンモード中は無効） |
| レンダリングされたパスをクリック | 対応するレイヤーを選択 |

### 閉じたパスの挙動

閉じたパスでも、各アンカーは独立したセグメントとして扱う:

- **アンカーをドラッグ**: そのアンカー本体と、自身の `in` / `out` ハンドルが一体で移動する
- **`out` ハンドルのミラー**: 同じアンカーの `in` ハンドル
- **`in` ハンドルのミラー**: 同じアンカーの `out` ハンドル
- 閉じていることによって、別アンカーのハンドル同士がミラー関係になることはない

## movingGroup（連動移動グループ）

ドラッグ時に一緒に移動するポイントを決定する computed プロパティ:

| 選択対象 | 移動対象 |
|---|---|
| アンカーポイント（Segment） | アンカー本体 + `in` ハンドル + `out` ハンドル |
| ハンドル（Point） | そのハンドルのみ |

## グリッドスナップ

- 有効時、全てのポイント座標が `gridSize / 2`（= 10px）単位にスナップされる
- 対象: 新規ポイント作成時、ドラッグ移動時
- ツールバーのボタンでトグル

```typescript
snapPoint(point: Point): Point {
  const halfGrid = this.gridSize / 2; // = 10
  return {
    x: Math.round(point.x / halfGrid) * halfGrid,
    y: Math.round(point.y / halfGrid) * halfGrid
  };
}
```

## UI 構成

### ツールバー（左上フローティング）

| ボタン | 機能 |
|---|---|
| Pen Mode | アクティブパスが閉じている時のみペンモードに入る。開いたパスでは disabled |
| Scissors | ハサミツールのオン/オフ。有効化するとペンモードは自動的にオフ |
| Snap to Grid | グリッドスナップのオン/オフ切り替え |

### サイドバー（右側）

| パネル | 内容 |
|---|---|
| Layers | パスレイヤー一覧（サムネイル付き）+ Add Path ボタン |
| SVG Output | 生成された SVG パス文字列（読み取り専用 textarea）+ Copy SVG ボタン |

### レイヤー管理

- 複数パスを独立したレイヤーとして管理
- アクティブレイヤーのみ編集可能（ハンドル・アンカー表示）
- Add Path で新しい空パスを追加し、自動的にアクティブ化
- ペンモード中はレイヤー切り替え不可

## 座標変換

`screenToSvg()`: スクリーン座標（`clientX`, `clientY`）を SVG viewBox 座標に変換する。`SVGGraphicsElement.getScreenCTM()` の逆行列を使用。

## ハサミツール（Scissors Tool）

曲線を指定位置で分割するツール。

### 状態

| 変数 | 型 | 初期値 | 説明 |
|---|---|---|---|
| `scissorsMode` | `boolean` | `false` | ハサミモード有効 |

- `scissorsMode` と `penMode` は相互排他。一方が `true` のときもう一方は強制的に `false`
- ハサミモード有効時は全パスのハンドル・アンカーを非表示にする
- ハサミモード有効時はレイヤー切り替えとレンダリング済みパスのクリック選択は無効化される

### 操作

| 操作 | 動作 |
|---|---|
| ツールバーのハサミボタン | `scissorsMode` をトグル。有効化時に `penMode = false` かつ `selection = null` |
| キャンバスクリック（`pointerdown`） | すべてのパス上で最も近い曲線点を探索し、しきい値以内にヒットすれば分割する |

ヒット判定のしきい値は SVG 座標で `10`。

### 分割アルゴリズム

クリック位置に最も近いセグメント（`points[i]` と `points[i+1]` の間の三次ベジェ）とパラメータ `t` を、曲線上を 500 点サンプリングして求める。

求めた `t` を用いて De Casteljau のアルゴリズムで三次ベジェを分割する:

```
P0 (anchor) — P1 (out)
                 \
                  Q0 — Q1 — Q2
                        \   /
                         R0 R1
                          \ /
                           S0   ← 分割点（新しいアンカー位置）
                          / \
                         R1 — R1
                        /   \
            P2 (in) — P3 (anchor)
```

- 左側サブ曲線: `P0 → Q0 → R0 → S0`
- 右側サブ曲線: `S0 → R1 → Q2 → P3`

ここで `Q_i = lerp(P_i, P_{i+1}, t)`、`R_0 = lerp(Q_0, Q_1, t)`、`R_1 = lerp(Q_1, Q_2, t)`、`S_0 = lerp(R_0, R_1, t)`。

### パスへの反映

ハサミは**パスを分離しない**。分割点に新しいアンカーを 1 つ挿入するだけで、パスは連結したままの単一 Path として保持される（`closed` 状態も変更しない）。

対象セグメント `startIdx → endIdx`（`endIdx = (startIdx + 1) mod n`）に対して:

- `points[startIdx].out` を `Q0` に更新
- `points[endIdx].in` を `Q2` に更新
- 新しいアンカー `{ x: S0.x, y: S0.y, in: R0, out: R1, mirror: false }` を `startIdx` と `endIdx` の間に挿入
  - 通常セグメント: `points.splice(startIdx + 1, 0, newAnchor)`
  - 閉じたパスの閉路セグメント（`startIdx = n - 1`, `endIdx = 0`）: 配列の末尾に追加（巡回的に `points[n-1]` と `points[0]` の間に相当する）

挿入結果として Path の `points.length` は 1 増える。新しいアンカーは `mirror = false`（De Casteljau が生成するハンドルは一般に対称ではないため）。

### 分割後の状態

- 対象 Path は更新されたものに置き換えられる（`paths[pathIndex] = next`）
- `selectedPathIndex` は対象 Path のまま変化しない
- `selection` は `null` にクリアされる
- `scissorsMode` は維持されるので連続して分割操作を続けられる
