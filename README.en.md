<p align="center">
  <img src="docs/banner.png" alt="Astrolabe — for your research" width="100%">
</p>

<p align="center">
  Spread every accepted paper of a conference across the sky as constellations, and light up only the ones that match your research.
</p>

<p align="center">
  <a href="README.md">한국어</a> · <b>English</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/NeurIPS%20·%20ICLR%20·%20ICML-2024–2026-ffd27a?labelColor=0a0f1e" alt="conferences">
  <img src="https://img.shields.io/badge/model-Jev-9db4ff?labelColor=0a0f1e" alt="model">
  <img src="https://img.shields.io/badge/runs-locally-8a93a8?labelColor=0a0f1e" alt="local">
  <img src="https://img.shields.io/badge/license-MIT-e7eaf3?labelColor=0a0f1e" alt="MIT license">
</p>

---

Every conference accepts thousands of papers. This tool picks out the ones that fit your topic.
Instead of keyword matching or embedding similarity, [Jev](https://typesafe.ai) **reads the abstract of every single paper** and returns a probability that "this work falls under this topic."

<p align="center">
  <img src="docs/search.png" alt="Searching NeurIPS 2025 for mechanistic interpretability of LLMs" width="100%">
</p>

- **A whole conference at once** — judges all 5,857 NeurIPS 2025 papers in about 2 seconds for about $0.08.
- **Constellations by area** — papers cluster into star groups by the conference's own subject areas, and only the ones that pass the judgment light up. You can see at a glance which areas they concentrate in.
- **Threshold slider** — since judgments come back as probabilities, you can tune strictness without calling the model again. Results export to CSV.
- **On your machine, with your key** — everyone runs it locally; your key only passes through your browser and the local server on your own machine.

<p align="center">
  <img src="docs/timeline.png" alt="Conference picker: conferences laid out in order of when they are held" width="100%">
</p>

## Running it

Requires Node.js 20+ and Python 3 (for fetching data; no extra packages).

```bash
git clone https://github.com/yongukpark/astrolabe.git
cd astrolabe
npm install
npm run data       # fetch conference paper data (about 15 s – 1 min)
npm run dev        # http://localhost:3000
```

1. Enter a Jev API key — from [OpenRouter](https://openrouter.ai/keys) or [TypeSafe](https://console.typesafe.ai/keys).
   Usage is billed to your own key: about $0.02–0.09 per search depending on conference size. OpenRouter requires you to add credits first.
2. Pick a conference on the timeline.
3. Describe your research topic. The more specific you are — including what to include or exclude — the more accurate the results.
   e.g. `mechanistic interpretability of LLMs — circuits, SAE features, probing hidden activations`

## Supported conferences

|  | 2024 | 2025 | 2026 |
|---|---:|---:|---:|
| **NeurIPS** | 4,537 | 5,857 | 8,856 ※ |
| **ICLR** | 2,275 | 3,830 | 5,353 |
| **ICML** | 2,634 | 3,339 | 6,356 |

※ NeurIPS 2026 abstracts and subject areas are not public yet, so papers are judged **by title only**. Accuracy is much lower than with abstracts (F1 0.88 → 0.60 on NeurIPS 2025).
Once abstracts are released, just run `npm run data` again.

## Key storage

- Your key is stored in plain text in your browser's localStorage only.
- When you search, it goes through the local server on your machine (`/api/judge`) to the Jev provider and nowhere else; it is never stored or logged.
- If you deploy this server publicly, other people's keys will pass through your server — so it is meant to be run locally by each user.

## Data sources and rights

- **Paper data** is not included in this repository. `npm run data` downloads it to your own machine from the public data on each conference's official site (`neurips.cc` · `iclr.cc` · `icml.cc`). For ICLR · ICML 2026, whose official data lacks abstracts, abstracts are filled in from [papercopilot/paperlists](https://github.com/papercopilot/paperlists).
- Copyright in paper titles and abstracts belongs to the authors and the respective conferences. This project is not affiliated with any conference; check each source's terms before redistributing the downloaded data.
- Judgments call Jev ([TypeSafe](https://typesafe.ai) · [OpenRouter](https://openrouter.ai)) with your own key and are subject to each provider's terms.
- The banner and screenshots were made by this project. Fonts: Chakra Petch · Noto Sans KR (SIL OFL 1.1). Libraries: Next.js · React (MIT).
- The code is under the [MIT License](LICENSE). Paper data is not in the repository and is not covered by this license.
