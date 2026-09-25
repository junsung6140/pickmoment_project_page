# PickMoment 프로젝트 페이지

목표 주소: `https://junsung6140.github.io/pickmoment_project_page/`

디자인: 어두운 "exposure" 테마 (PRISM·ODDR와 구분). Bulma는 더 이상 쓰지 않음 — `static/css/index.css` 하나로 동작.

```
pickmoment_project_page/
├── index.html              # 페이지 본문
├── .nojekyll               # GitHub Pages의 Jekyll 처리 끄기
├── static/
│   ├── css/  bulma.min.css, index.css
│   ├── js/   pickmoment.js  (데모 · 영상 · 슬라이더 · placeholder)
│   ├── data.json           # 자산 목록 (직접 수정하는 원본)
│   ├── data.js             # data.json에서 생성됨 — 직접 수정 X
│   ├── image/  teaser.jpg, method.jpg
│   ├── demo/<scene>/       input.jpg, tau_XX.jpg, int_II_JJ.jpg
│   ├── videos/             <clip>.mp4, <clip>_poster.jpg
│   └── deblur/             <id>_blur.jpg, <id>_ours.jpg, <id>_fidediff.jpg
└── tools/build_assets.py   # 렌더링한 결과 → 웹 자산 + data.json 갱신
```

자산이 없는 동안에도 페이지는 동작합니다.
- Pick-a-Moment 데모, deblur 슬라이더: 브라우저에서 계산하는 **합성 toy scene** (“Synthetic illustration — not model output” 배지 표시)
- 영상, teaser/method 그림: “coming soon” placeholder

## 로컬 미리보기

```bash
cd pickmoment_project_page
python3 -m http.server 8000     # → http://localhost:8000
```
`data.js`를 쓰기 때문에 `index.html`을 더블클릭해서 열어도 됩니다 (fetch 불필요).

## 자산 추가

`build_assets.py`는 **모델을 실행하지 않습니다.** 추론 코드로 먼저 렌더링하고, 아래 이름 규칙대로 저장한 뒤 실행하세요. 모든 명령은 파일을 `static/`에 복사·리사이즈하고 `data.json`/`data.js`를 갱신합니다.

### 1) Pick-a-Moment 데모 (장면당 70장)

그리드는 모든 장면이 공유합니다 (기본 τ 32등분, 구간 8등분).

| 파일 | 개수 | 모델에 넣을 query $(s,t)$ |
|---|---|---|
| `input.png` | 1 | — (blurry 입력) |
| `tau_<k>.png`, k = 0…32 | 33 | $(k/32,\ k/32)$ — zero-width = sharp frame |
| `int_<i>_<j>.png`, 0 ≤ i < j ≤ 8 | 36 | $(i/8,\ j/8)$ |

숫자는 zero-padding 있어도/없어도 됩니다 (`tau_7`, `tau_07` 모두 OK). 하나라도 빠지면 어떤 파일이 없는지 알려주고 멈춥니다.

```bash
python3 tools/build_assets.py demo --src renders/gopro01 --id gopro01 --label "GoPro #1"
```
기본 폭 960px, JPEG q88. 장면 3–5개 정도가 적당합니다 (장면당 대략 수 MB).
`data.json`의 `"includeToy": true`면 toy scene이 마지막 썸네일로 남습니다. 빼려면 `false`.

### 2) Blur-to-video 비교 영상

열마다 프레임 폴더 하나 (파일명 순 정렬, 모든 열의 프레임 수가 같아야 함).
Blur2Vid는 past/present/future를 함께 생성하므로, GT와 맞추려면 **노출 구간 안의 프레임만** 넣으세요.

```bash
python3 tools/build_assets.py video --id clip01 --label "GoPro #1" \
  --input renders/clip01/blur.png \
  --col "Blur2Vid=renders/clip01/blur2vid" --col "Ours=renders/clip01/ours" --col "GT=renders/clip01/gt"
```
옆으로 이어붙인 H.264 mp4 하나를 만듭니다 (ffmpeg 필요, 기본 높이 360px, 8 fps). 열 이름은 페이지에서 영상 아래에 표시되고, `Ours`로 시작하는 열이 강조됩니다.

### 3) Deblur 슬라이더

```bash
python3 tools/build_assets.py deblur --id hide03 --label "HIDE #3" \
  --blur b.png --ours o.png --fidediff f.png      # --fidediff는 선택
```

### 4) Teaser / Method 그림

```bash
python3 tools/build_assets.py figure --src ../2026NeurIPS/figures/figure1.pdf --name teaser
python3 tools/build_assets.py figure --src method.png --name method
```
PDF는 `pdftoppm`(poppler) 필요: `brew install poppler`.

### 5) 점검 / 삭제

```bash
python3 tools/build_assets.py check                              # 참조 파일이 다 있는지
python3 tools/build_assets.py remove --section demo --id gopro01 # 목록에서만 삭제 (파일은 남김)
```

## GitHub Pages 배포

PRISM이 어떤 방식으로 올라가 있는지 공개 저장소에서 확인하지 못했습니다. 둘 중 PRISM과 같은 방식을 쓰면 됩니다.

**A. 별도 저장소** — `junsung6140/pickmoment_project_page` 저장소를 만들고 이 폴더 내용을 루트에 push → Settings → Pages → Branch `main` / `(root)`. 주소는 자동으로 `junsung6140.github.io/pickmoment_project_page/`.

**B. 개인 사이트 저장소의 하위 폴더** — `junsung6140.github.io` 저장소에 `pickmoment/` 폴더째로 추가해서 push.

(비공개 저장소에서 Pages를 쓰려면 유료 플랜이 필요합니다.)

## 공개 전 체크리스트

`index.html`에서 `TODO`로 검색하면 전부 나옵니다.

- [ ] 저자 4명 소속 확인 (현재 “Hanyang University, VILAB”으로 표기)
- [ ] 공동저자 홈페이지 링크 (현재 신준성, 김태현 교수님만 링크)
- [ ] arXiv / Code 버튼: `href` 채우고 `is-disabled` 제거
- [ ] `og:image` 메타 태그 (teaser 추가 후)
- [ ] **Deblur 표 수치 검증** — GoPro/Ours 행은 rebuttal과 일치 확인됨. GoPro/FideDiff 행과 HIDE 두 행은 로컬 `main.tex` 초안에서 가져온 값이라 camera-ready Table 1과 대조 필요
- [ ] Abstract를 camera-ready 최종본으로 교체. 현재 rebuttal에서 약속한 두 표현만 반영됨: “generative-prior-based”, “one forward pass per output frame”
- [ ] 실제 자산을 넣은 뒤 toy scene 유지 여부 결정 (`includeToy`)

## 페이지 수치 출처

모든 수치는 OpenReview 공개 스레드(rebuttal 포함) 기준입니다.

| 섹션 | 출처 |
|---|---|
| GoPro-7 blur-to-video 표 | 논문 Tab. 2 / rebuttal (waxE, azAw) |
| Warp 기반 temporal consistency | rebuttal (waxE W1/Q3) |
| X4K1000FPS 33-timestamp | rebuttal (azAw W3/Q3) |
| $\mathcal{L}_\text{sharp}$-only ablation, Tab. 4 수치(0.73/0.69, 0.62/0.52 dB) | rebuttal (azAw W2, BpQ1 Q3/W4) |
| FideDiff 대비 12/16 셀, ≈25× 속도, 7.90 s | rebuttal (BpQ1 W3, waxE W1/Q2) |
| Deblur 표 | 위 체크리스트 참고 (일부 검증 필요) |
