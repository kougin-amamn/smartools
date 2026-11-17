---
type: Guide
title: "作業の進め方"
description: "新しいツールの作り方と、設計書・試験をどこまでやるか"
tags: ["進め方", "試験"]
status: stable
---

# 作業の進め方

## 新しいツール

1. `node scripts/new-tool.js <slug> <名称> <英名> [キャッチ] [説明]` でひな形を作る。
2. `docs/design/<slug>.md` を書く(下の「設計書の範囲」)。
3. 作る。計算は `<slug>-core.js` に分け、`tests/core/<slug>.test.js` を足す。
4. アイコンの絵を描き、`index-data.json` に1行(slug・分類・札)、`lang/ja.json` と `lang/en.json` に名前と説明を足す。
5. `node tests/core.js <slug>` と `node tests/smoke.js tools/<slug>` を通し、Prettier で整える。

## 設計書の範囲

書く量と章の分け方(基本設計・詳細設計)は、[design/template.md](./design/template.md) の「書く量」に従います。

## 試験の範囲

| 変更の大きさ | 試験 |
| --- | --- |
| 文言・見た目の小さな修正 | 構文チェック(`node --check`)と Prettier |
| 既存ツールの機能追加 | `node tests/core.js <slug>`(計算を変えた時)と `node tests/smoke.js tools/<slug>`、変えた操作だけブラウザで確かめる |
| 新しいツール | 上に加え、主な流れを1本(複雑な物は `tests/scenarios/<slug>.js` に残す) |
| 共通部品の変更 | `node tests/core.js` と `node tests/smoke.js all` |

スクリーンショットは見た目を変えた時だけ撮ります。
