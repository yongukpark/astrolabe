# Astrolabe — for your research

학회 채택 논문 전체를 연구 주제 한 줄로 걸러보는 로컬 도구입니다.
NeurIPS · ICLR · ICML 논문을 분야별 별자리로 펼치고, [Jev](https://typesafe.ai)가 초록마다 "이 주제에 맞는가"를 확률로 판정해 맞는 논문만 빛나게 합니다.

## 실행

Node.js 20 이상이 필요합니다.

```bash
git clone https://github.com/yongukpark/find-papers.git
cd find-papers
npm install
npm run dev        # http://localhost:3000
```

1. Jev API 키를 넣습니다 ([OpenRouter](https://openrouter.ai/keys) 또는 [TypeSafe](https://console.typesafe.ai/keys)).
2. 연표에서 학회를 고릅니다.
3. 연구 주제를 입력합니다. 결과는 점수순(같으면 제목순)으로 나오고 CSV로 내보낼 수 있습니다.

검색 한 번에 학회 전체를 판정하며, NeurIPS 2025(5,857편) 기준 약 2초 · 약 $0.08입니다 (Jev: 입력 100만 토큰당 $0.042).

## 키 보관

- 키는 브라우저 localStorage에만 평문으로 저장됩니다.
- 검색할 때 내 PC의 로컬 서버(`/api/judge`)를 거쳐 Jev 제공자에게만 전달되고, 저장·기록하지 않습니다.
- 이 서버를 공개 배포하면 다른 사람의 키가 배포자 서버를 지나가게 되므로, **각자 로컬에서 실행하는 것을 전제**로 합니다.

## 데이터 출처

| 데이터 | 출처 | 비고 |
|---|---|---|
| 채택 논문 목록 · 제목 · 초록 · 발표 형태 · 분야 | 각 학회 공식 사이트의 공개 데이터<br>`neurips.cc` · `iclr.cc` · `icml.cc` `/static/virtual/data/<학회>-<연도>-orals-posters.json` | 수집: `scripts/fetch_conf.py` |
| ICLR 2026 · ICML 2026 초록 보강 | [papercopilot/paperlists](https://github.com/papercopilot/paperlists) | 공식 데이터에 초록이 없는 경우에만 사용. 해당 저장소에는 라이선스가 명시되어 있지 않음 |
| NeurIPS 2026 | 공식 공개 데이터 (2026-09-26 받음) | 초록·분야 미공개라 **제목만으로 판정** (NeurIPS 2025 실측 F1 0.60, 초록 포함 시 0.88). 초록이 공개되면 다시 받으면 됨 |
| 논문 링크 · PDF | [OpenReview](https://openreview.net), [NeurIPS Proceedings](https://proceedings.neurips.cc) | 링크만 저장하며 PDF는 저장하지 않음 |
| 개최 도시 · 시기 | 각 학회 공식 사이트 | `public/data/index.json`에 수기 입력 |

데이터 다시 받기:

```bash
python3 scripts/fetch_conf.py neurips 2025
python3 scripts/fetch_conf.py neurips 2026 data/raw/neurips-2026-orals-posters.json   # 받아 둔 파일로
```

## 권리 고지

- **논문 내용:** 논문 제목과 초록의 저작권은 각 저자와 해당 학회·출판사에 있습니다. 이 저장소는 개인 연구용 검색을 위해 공개된 메타데이터를 모아 두었을 뿐이며, 원문은 위 출처에서 확인해야 합니다. 저장소를 공개하거나 데이터를 재배포하려면 각 출처의 이용 조건을 먼저 확인하세요.
- **학회 명칭:** NeurIPS, ICLR, ICML은 각 주최 재단의 명칭입니다. 이 프로젝트는 어느 학회와도 관련이 없습니다.
- **모델:** 판정은 TypeSafe의 Jev 모델을 사용자 본인의 키로 호출해 이뤄지며, 각 제공자([TypeSafe](https://typesafe.ai), [OpenRouter](https://openrouter.ai))의 이용 약관을 따릅니다.
- **글꼴:** [Chakra Petch](https://fonts.google.com/specimen/Chakra+Petch), [Noto Sans KR](https://fonts.google.com/noto/specimen/Noto+Sans+KR) — SIL Open Font License 1.1, Google Fonts에서 불러옵니다.
- **라이브러리:** [Next.js](https://github.com/vercel/next.js) · [React](https://github.com/facebook/react) (MIT).
