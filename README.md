<p align="center"><img src="./app/assets/images/SealCircle.svg" width="150px" height="150px" alt="aventium softworks"></p>

<h1 align="center">沼ランチャー</h1>

<em><h5 align="center">(formerly Electron Launcher)</h5></em>

[<p align="center"><img src="https://img.shields.io/github/downloads/dscalzi/HeliosLauncher/total.svg?style=for-the-badge" alt="downloads">](https://github.com/TeamKun/NumaLauncher/releases)</p>

| Platform | File |
| -------- | ---- |
| Windows x64 | `NumaLauncher-setup-VERSION.exe` |
| macOS with Intel CPU | `サポート対象外` |
| macOS with AppleSilicon CPU | `サポート対象外` |
| Linux x64 | `サポート対象外` |

## Console

エラーが発生した場合、コンソールを開くことで内容を確認できる場合があります

```console
ctrl + shift + i
```

![console example](https://i.imgur.com/T5e73jP.png)


## Development

### Getting Started

**System Requirements**

* Install Dependencies: Node.js v12
* Build Installers: Node.js v16

---

**Clone and Install Dependencies**

```console
> git clone https://github.com/TeamKun/NumaLauncher.git
> cd NumaLauncher
> npm install
```

---

**Launch Application**

```console
> npm start
```

---

**Build Installers**

STEP1. <a src="https://github.com/TeamKun/config-files/releases">jdk.zip</a>をダウンロードしプロジェクトルートに展開

STEP2. プラットフォームごとにコマンドを下記実行

| Platform    | Command            |
| ----------- | ------------------ |
| Windows x64 | `npm run dist:win` |
| macOS       | `npm run dist:mac` |

!! mac OS用のインストーラはIntel,AppleSiliconそれぞれのプロセッサごとに実機でbuildが必要

---
