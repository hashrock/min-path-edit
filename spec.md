# min-path-edit 仕様書

SVG ベジェ曲線パスエディタ。Vue 3 + TypeScript で構築。

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

- 最初のポイント: `in = null`（後方ハンドルなし）
- パスが閉じた時の最終ポイント: `out = null`（前方ハンドルなし）
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
- `C cx1 cy1, cx2 cy2, x y` — 三次ベジェ曲線（各セグメント間）
- `Z` — パスを閉じる（`closed = true` の場合）

ハンドルが `null` の場合はアンカーポイント座標がフォールバックとして使われる。

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
| `anchorChange` | `boolean` | `false` | Ctrl/Cmd キー押下中 |
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
  ├─ ツールバーの Pen ボタン → penMode: true（※現在のパスが閉じている場合のみ意味あり）
  │
  └─ Add Path ボタン → 新パス追加 → penMode: true
```

### ドラッグ操作のライフサイクル

```
pointerdown
  │  offset を記録、setPointerCapture
  │  selection / selectedSegment / selectedType を設定
  ▼
pointermove（繰り返し）
  │  スクリーン座標 → SVG座標変換
  │  グリッドスナップ適用
  │  movingGroup 内の全ポイントを移動
  │  ミラーハンドルの反映
  ▼
pointerup
  │  offset = null（ドラッグ終了）
  │  anchorChange が true なら mirror を反転
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

pointerup 時に `anchorChange = true` であれば、`selectedSegment.mirror` が反転（トグル）される。

## マウス操作

### ペンモード（`penMode: true`）

| 操作 | 動作 |
|---|---|
| キャンバスをクリック | 新しいアンカーポイントを作成。作成直後に `out` ハンドルが選択状態になり、ドラッグでハンドル位置を調整可能 |
| 最初のアンカーをクリック | パスを閉じる（`closed = true`）。最初のアンカーの `out` ハンドルをドラッグで調整可能。ペンモード終了 |

### 編集モード（`penMode: false`）

| 操作 | 動作 |
|---|---|
| アンカーポイントをドラッグ | アンカーと付属ハンドル（`in`, `out`）が一体で移動する |
| `out` ハンドルをドラッグ | `out` ハンドルのみ移動。`mirror = true` なら `in` ハンドルも対称移動 |
| `in` ハンドルをドラッグ | `in` ハンドルのみ移動。`mirror = true` なら `out` ハンドルも対称移動 |
| Ctrl/Cmd + ハンドルドラッグ | ミラーモードを一時的に反転してドラッグ |
| レイヤーサムネイルをクリック | アクティブレイヤーを切り替え（ペンモード中は無効） |
| レンダリングされたパスをクリック | 対応するレイヤーを選択 |

### 閉じたパスの特殊挙動

閉じたパスでは始点と終点が連結される:

- **始点をドラッグ**: 終点とその `in` ハンドルも一緒に移動
- **終点をドラッグ**: 始点とその `out` ハンドルも一緒に移動
- **始点の `out` ハンドルのミラー**: 終点の `in` ハンドル
- **終点の `in` ハンドルのミラー**: 始点の `out` ハンドル

## movingGroup（連動移動グループ）

ドラッグ時に一緒に移動するポイントを決定する computed プロパティ:

| 選択対象 | 移動対象 |
|---|---|
| アンカーポイント（Segment） | アンカー本体 + `in` ハンドル + `out` ハンドル |
| ハンドル（Point） | そのハンドルのみ |
| 閉じたパスの始点 | 始点 + 終点 + 終点の `in` |
| 閉じたパスの終点 | 終点 + 始点 + 始点の `out` |

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
| Pen Mode | ペンモードのオン/オフ切り替え |
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
