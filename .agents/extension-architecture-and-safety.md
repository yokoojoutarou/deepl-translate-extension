# Skill: Extension Architecture and Safety

## Intent
Chrome Extension (Manifest V3) の実装で、翻訳機能と生成AI機能を分離しつつ、最小変更で安全に開発する。

## Apply When
- 新機能を追加する
- ファイル配置を変更する
- message routing / API 呼び出しを変更する
- side panel / content script / background の連携を触る

## Rules
- 変更は要求範囲のみ。無関係なリファクタや命名変更をしない。
- 不具合は根本原因を修正する。
- 既存 UI/UX を壊さない。依頼のない新規 UI は追加しない。
- 既存スタイル（Vanilla JS, シンプルな関数分割）を維持する。

## Structure
- 共通・横断処理は `core/` に置く。
  - 例: `core/background.js`
- 翻訳機能は `features/translate/` に置く。
  - `content.js`（選択検知）
  - `sidepanel/`（UI: HTML/CSS/JS）
- 生成AI機能は `features/ai/` を新設して実装する。
- 新機能は機能単位でディレクトリを分離する。

## Extension Constraints
- `manifest.json` のエントリと実ファイルの整合を必ず維持する。
  - `background.service_worker`
  - `content_scripts[].js`
  - `side_panel.default_path`
- Content Script では `chrome.runtime.sendMessage` の失敗を考慮し、適切にハンドリングする。
- Side Panel 未オープン時の送信失敗で拡張全体が落ちないようにする。
- APIキー等の設定は `chrome.storage.local` で扱い、ハードコードしない。

## Change Checklist
- 変更後に対象ファイルのエラーを確認する。
- パス変更時は以下を更新する。
  - `manifest.json`
  - HTML 内の script/css パス
  - README の構成図
- 翻訳フロー（選択 → background中継 → sidepanel反映）を壊さない。

## AI Feature Guidelines
- 翻訳機能と message type を分離する（例: `AI_ASK`, `AI_RESPONSE`）。
- sidepanel では翻訳セクションと AI セクションを明確に分離する。
- プロンプト送信前に選択テキストの空チェック・長さチェックを行う。
- モデル/プロバイダ切替を想定し、AI 呼び出しを `core/` か `features/ai/` で抽象化する。
