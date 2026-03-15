---
name: issue-06-local-storage-foundation
description: Issue #6 の要件定義。チャット・メモ・マーカー・サイト情報を保持するローカルストレージ基盤を定義するSkill。
---

# Skill: issue-06-local-storage-foundation

## Issue

- GitHub Issue: #6 データベース

## 目的

`chrome.storage.local` を使って、チャット履歴・メモ・マーカー・サイト単位のメタ情報を一貫した構造で保存できる基盤を作る。

## 重要度

- 優先度: **P0**
- 理由: 保存が必要な複数Issueの前提機能であるため。

## スコープ

- ストレージキー設計
- 読み書きAPIの抽象化
- URL/日時/本文を持つ保存モデルの定義
- データ破損を防ぐ最低限のバリデーション

## 機能要件

1. `chrome.storage.local` 上に永続化レイヤーを設ける。
2. チャット履歴を `url`, `title`, `createdAt`, `updatedAt`, `messages[]` 単位で保存できる。
3. メモを `siteId`, `noteId`, `markdown`, `sourceLinks[]`, `createdAt`, `updatedAt` で保存できる。
4. マーカーを `siteId`, `markerId`, `color`, `rangeDescriptor` または DOM復元情報で保存できる。
5. 将来のライブラリー機能を見据え、サイト単位の集約オブジェクトを持てる。
6. 保存・取得・更新・削除の基本操作を共通APIとして提供する。

## 非機能要件

- Manifest V3 の制約下で同期的な重処理を避ける。
- 既存の翻訳/AI機能に副作用を出さない。
- スキーマ変更時に拡張しやすい構造にする。

## データモデル要件

- ルートに単一巨大オブジェクトを置く場合でも、`schemaVersion` を保持する。
- `siteId` は URL を基に安定生成する。
- メッセージは `role`, `content`, `timestamp` を最低限保持する。
- 将来の検索を見据え、本文はプレーンテキスト抽出値も持てる形にする。

## 受け入れ条件

- 任意のサイトに対してチャット履歴を保存・再取得できる。
- 任意のサイトに対してメモ配列を保存・更新できる。
- マーカー情報を色付きで保存・削除できる。
- ストレージ未初期化状態でも例外なく初期化できる。

## 変更候補

- `core/` にストレージアクセサを追加
- `core/background.js` から保存処理を呼べるようにする
- 必要に応じて `features/ai/` と `features/translate/` から共通APIを利用する

## 実装順

1. スキーマとキー設計を決める。
2. `core/` に保存APIを追加する。
3. チャット保存を最初に接続する。
4. メモ/マーカーで再利用する。
