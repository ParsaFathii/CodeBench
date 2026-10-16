# مرجع HTTP API

همه endpointها زیر `/api/v1` قرار دارند و به‌صورت Next.js Route Handler پیاده
شده‌اند (`src/app/api/v1/**/route.ts`). همه مسیرها dynamic هستند. بدنه درخواست و
پاسخ (مگر خلافش ذکر شود) JSON است. همین API پشت رابط کاربری وب است، پس هر کاری UI
می‌کند با curl هم شدنی است.

## کدهای وضعیت

| کد | معنا در CodeBench |
|---|---|
| 200 | موفق |
| 201 | منبع ساخته شد (آزمایش، ‏clone، گزارش) |
| 202 | پذیرفته شد برای پردازش asynchronous (شروع run، درخواست لغو، شروع تحلیل هوش مصنوعی) |
| 400 | درخواست بدشکل (‏JSON نامعتبر، پارامتر query الزامی حذف‌شده، نام نامعتبر) |
| 404 | موجودیت ارجاع‌شده وجود ندارد |
| 409 | تعارض — run دیگری در حال اجراست، run فعالی برای لغو وجود ندارد، یا run هنوز در حال اجراست (تحلیل هوش مصنوعی) |
| 422 | payload از نظر معنایی نامعتبر (خطاهای اعتبارسنجی config، یکسان بودن baseline و candidate، فرمت گزارش نامعتبر، تنظیمات نامعتبر) |
| 502 | ارائه‌دهنده هوش مصنوعی شکست خورد یا پاسخ قابل استفاده نداد |

---

## سرویس

### GET /api/v1/health

```json
{ "status": "ok", "service": "codebench", "version": "1.0.0", "time": "2026-01-01T00:00:00.000Z" }
```

### GET /api/v1/environment

متادیتای host و موتورها. فیلد `environment` یک capture تازه است (سیستم‌عامل،
معماری، مدل/تعداد هسته CPU، حافظه، runtime میزبان، commit مربوط به git در صورت
وجود، بار سیستم، سیاست ایزولاسیون، یادداشت‌ها). فیلد `engines` probing زندهٔ در
دسترس بودن per زبان است:

```json
{
  "environment": { "osPlatform": "linux", "arch": "x64", "cpuModel": "…",
    "cpuCores": 8, "totalMemBytes": "…", "hostRuntime": "Node v24",
    "commitSha": null, "capturedAt": "…",
    "metadata": { "loadavg": [0.1, 0.2, 0.2], "isolationPolicy": "…", "notes": ["…"] } },
  "engines": [
    { "language": "cpp", "available": true, "runtime": "g++ 14.2.0",
      "harness": "google-benchmark", "harnessVersion": "1.9.4", "detail": "ready" },
    { "language": "java", "available": true, "runtime": "openjdk 21…",
      "harness": "jmh", "harnessVersion": "1.37", "detail": "ready" },
    { "language": "python", "available": true, "runtime": "Python 3.12…",
      "harness": "pyperf", "harnessVersion": "2.10.0", "detail": "ready" }
  ]
}
```

### GET /api/v1/languages

```json
{
  "languages": [
    { "id": "cpp", "name": "C++", "standard": "C++20", "harness": "Google Benchmark", "color": "amber" },
    { "id": "java", "name": "Java", "standard": "Java 21 (Temurin)", "harness": "JMH", "color": "rose" },
    { "id": "python", "name": "Python", "standard": "CPython 3.12", "harness": "pyperf", "color": "emerald" }
  ],
  "engines": [ /* همان ساختار engines مربوط به /environment */ ]
}
```

### GET /api/v1/algorithms

کاتالوگ راستی‌آزمایی‌شده: مقدار `workloadSpecVersion` (رشته `"1.0.0"`)، آرایه
`algorithms` (‏۶ خانواده به‌همراه واریانت‌ها، دیتاست‌ها، سایزهای پیش‌فرض و قرارداد
خروجی) و آرایه تخت `catalog` (یک عضو per کلید واریانت، با `variantKey`،
`category`، `complexity`، `measuredOp`، `notes`، `maxSize`، `datasets`،
`defaultSizes`، `outputContract` و…). شرح کامل در [ALGORITHMS_FA.md](ALGORITHMS_FA.md).

---

## آزمایش‌ها (Experiments)

### GET /api/v1/experiments

فهرست آزمایش‌ها از جدیدترین، هرکدام با خلاصه آخرین run آن:

```json
{ "experiments": [
  { "id": "clx…", "name": "Sorting across C++ / Java / Python",
    "description": "…", "config": { /* ExperimentConfig */ },
    "createdAt": "…", "runCount": 2,
    "lastRun": { "id": "clx…", "status": "COMPLETED", "createdAt": "…", "progress": 100 } }
] }
```

### POST /api/v1/experiments

بدنه: `{ "name": string (الزامی، حداکثر ۱۲۰ کاراکتر)، "description"?: string,
"config"?: Partial<ExperimentConfig> }`.

ساختار `ExperimentConfig`:

```json
{
  "variants": ["sorting.merge_sort", "sorting.std_sort"],
  "languages": ["cpp", "java", "python"],
  "datasetType": "random_int",
  "inputSizes": [10000],
  "seed": 20261016,
  "warmup": 2,
  "repetitions": 5,
  "timeoutMs": 180000,
  "benchmarkMode": "avgt",
  "continueOnError": true
}
```

فیلدهای حذف‌شده `warmup` / `repetitions` / `timeoutMs` / `seed` از تنظیمات
ذخیره‌شده پر می‌شوند. قواعد اعتبارسنجی: حداقل یک واریانت، یک زبان و یک سایز
ورودی؛ `warmup ≥ 0`؛ `repetitions ≥ 2`؛ `timeoutMs ≥ 10000`؛ seed عدد صحیح؛ کلیدهای
واریانت شناخته‌شده؛ دیتاست باید توسط همه خانواده‌های انتخابی پشتیبانی شود؛ سایزهای
ورودی در بازه 8..2,000,000 و درون سقف‌های per واریانت (مثلاً ۴۰۹۶ برای
insertion sort).

پاسخ‌ها: `201 { id, name, config, warnings }` (فهرست warnings مثلاً واریانت‌های
در دسترس‌نیافتن در زبانهای انتخابی را می‌گوید) · خطای `400` برای JSON یا نام
نامعتبر · `422 { error: "invalid configuration", details: [...] }`.

### GET /api/v1/experiments/{id}

جزئیات آزمایش به‌همراه همه run های آن (وضعیت، پیشرفت، شمارنده‌های job،
`currentJob`، زمان‌ها، خطا). در صورت نبود، خطای `404`.

### POST /api/v1/experiments/{id}/run

شروع یک run جدید. coordinator پیکربندی ذخیره‌شده را اعتبارسنجی می‌کند، snapshot
محیط می‌گیرد، run های یتیم‌شده بر اثر restart را تعمیر می‌کند و اجرا را در
پس‌زمینه آغاز می‌کند.

پاسخ‌ها: `202 { "runId": "clx…" }` · `404` · `409` (run دیگری در حال اجراست —
بنچمارک‌ها سری اجرا می‌شوند؛ صبر کنید یا لغو کنید).

### POST /api/v1/experiments/{id}/cancel

درخواست لغو run فعالِ آن آزمایش. job جاری متوقف (kill گروه پروسه) و run با وضعیت
`CANCELLED` ثبت می‌شود.

پاسخ‌ها: `202 { "cancelled": true, "runId": "…" }` · `409` (run فعالی برای این
آزمایش وجود ندارد).

### GET /api/v1/experiments/{id}/results?runId=…

همه نتایج در کل run های آزمایش، یا نتایج یک run مشخص وقتی `runId` داده شود. هر
نتیجه شامل فیلدهای هویتی (`variantKey`، `category`، `language`، `datasetType`،
`inputSize`، `seed`، `harness`، `harnessVersion`)، راستی‌آزمایی
(`verificationStatus`، `refMatch`، `crossLangMatch`)، ‏`observations` (آرایه خام
ns/op)، `stats`، `extraMetrics` (مثلاً نرخ تخصیص Java)، `env`، `warnings`،
`durationMs`، `status` و `error` است.

### POST /api/v1/experiments/{id}/clone

کپی تعریف آزمایش (نام با پسوند " (clone)"، همان config). پاسخ‌ها: `201 { id,
name }` · `404`.

---

## اجراها (Runs)

### GET /api/v1/runs?status=…&limit=…

تاریخچه run ها (جدیدترین اول؛ سقف `limit` برابر ۱۰۰ و پیش‌فرض ۵۰)، به‌همراه
`activeRunId` اگر run ای در حال اجرا باشد. تعمیر run های stale را هم انجام می‌دهد.
هر run شامل `experimentName`، `config`، `progress`، شمارنده‌های job، `currentJob`،
`resultCount`، `commitSha`، زمان‌ها و `error` است.

### GET /api/v1/runs/{id}?afterLogId=…

جزئیات کامل run: وضعیت/پیشرفت/شمارندهها، `logs` (خطوط console زنده، مرتب‌شده؛
برای poll افزایشی، شناسه آخرین log دیده‌شده را به‌عنوان `afterLogId` بدهید؛ سقف
۵۰۰ خط)، `results` (همان ساختار endpoint نتایج آزمایش) و `environment` ثبت‌شده.
در صورت نبود، خطای `404`.

### GET /api/v1/runs/{id}/raw?resultId=…

دسترسی ممیزی به خروجی حفظ‌شده هارنس. بدون `resultId`: فهرستی از نتایج تکمیل‌شده
(`{ id, label, harness }`). با `resultId`: شیء `{ id, label, harness,
harnessVersion, env, observations, rawOutput }` که در آن `rawOutput` همان JSON
دست‌نخوردهای است که Google Benchmark / JMH / pyperf چاپ کرده‌اند. اگر نتیجه به آن
run تعلق نداشته باشد، خطای `404`.

---

## مقایسه‌ها

### GET /api/v1/comparisons?baseline=…&candidate=…

تحلیل رگرسیون بین دو run. پاسخ‌ها: `400` (شناسه‌های حذف‌شده) · `422` (یک run دو
بار داده شده) · `404` (run پیدا نشد) · `200` با گزارش:

```json
{
  "baselineRunId": "clx…", "candidateRunId": "clx…",
  "comparability": "comparable | workload-differs | environment-differs",
  "comparabilityNotes": ["…"],
  "regressionThresholdPct": 10,
  "rows": [
    { "algorithmId": "sorting", "variantId": "merge_sort",
      "variantKey": "sorting.merge_sort", "language": "cpp",
      "inputSize": 10000, "datasetType": "random_int",
      "baselineMedian": 512345.6, "candidateMedian": 523456.7,
      "deltaPct": 2.17, "ratio": 1.0217,
      "baselineCV": 0.012, "candidateCV": 0.014, "combinedCV": 0.0185,
      "verdict": "INCONCLUSIVE",
      "note": "|Δ| 2.2% < practical threshold 10%" }
  ],
  "generatedAt": "…"
}
```

احکام: `REGRESSION` / `IMPROVEMENT` / `INCONCLUSIVE` / `NO-DATA` / `NOT-COMPARABLE`
(شرح در [BENCHMARK_METHODOLOGY_FA.md](BENCHMARK_METHODOLOGY_FA.md)).

---

## گزارش‌ها

### POST /api/v1/reports

بدنه: `{ "runId": "…", "format": "json | csv | markdown" }`. یک گزارش قطعی تولید و
ذخیره می‌کند (تعریف آزمایش، آمار per نتیجه، مشاهدات خام، وضعیت راستی‌آزمایی، محیط،
روش‌شناسی و محدودیت‌ها؛ تفسیر هوش مصنوعی به‌عمد حذف شده است).

پاسخ‌ها: `201 { id, filename, format, contentType, content }` · `400` برای JSON
نامعتبر · `422` برای فرمت بد · `404` برای run ناموجود.

### GET /api/v1/reports?runId=…[&download=reportId]

بدون `download`: `{ "reports": [{ id, format, filename, createdAt }] }`. با
`download`: محتوای گزارش ذخیره‌شده به‌صورت attachment سرو می‌شود (‏Content-Type
برابر `application/json` / `text/csv` / `text/markdown`). خطای `400` برای حذف
runId · `404` برای گزارش ناموجود.

---

## هوش مصنوعی

### GET /api/v1/ai/status

```json
{ "configured": "zai", "provider": "zai", "available": true,
  "model": "z-ai (server-side SDK)", "detail": "reachable",
  "note": "AI interpretation is optional and strictly separated from measurements. …" }
```

### POST /api/v1/ai/analysis

بدنه: `{ "runId": "…" }`. payload شواهد را از نتایج ذخیره‌شده می‌سازد،
ارائه‌دهنده پیکربندی‌شده را صدا می‌زند، خروجی ساختاریافته را اعتبارسنجی و
grounding را بررسی می‌کند.

پاسخ‌ها: `202 { analysisId }` · `400` برای JSON نامعتبر · `404` برای run ناموجود ·
`409` وقتی run هنوز در حال اجراست · `422` برای حذف runId · `502` برای شکست
ارائه‌دهنده، نقض schema یا رد grounding.

### GET /api/v1/ai/analysis?runId=…

فهرست تحلیل‌های یک run (جدیدترین اول): `{ analyses: [{ id, runId, provider,
model, status (یعنی PENDING|COMPLETED|FAILED)، output, error, createdAt }] }.
فیلد `output` همان تحلیل ساختاریافته اعتبارسنجی‌شده است (`summary`،
`observed_findings`، `supporting_run_ids`، `statistical_evidence`، `limitations`،
`possible_explanations`، `recommended_experiments`، `confidence`).

---

## تنظیمات

### GET /api/v1/settings

پاسخ `{ settings, defaults }` که settings چنین شکلی دارد:

```json
{
  "ai": { "provider": "zai | ollama | disabled", "model": null,
          "ollamaUrl": "http://localhost:11434", "temperature": 0.2 },
  "defaults": { "warmup": 2, "repetitions": 5, "timeoutMs": 180000, "seed": 20261016 },
  "regressionThresholdPct": 10
}
```

### PUT /api/v1/settings

بدنه: یک شیء settings جزئی که با تنظیمات فعلی merge می‌شود. اعتبارسنجی: Ollama
به آدرس پایه نیاز دارد؛ `repetitions ≥ 2`؛ `warmup ≥ 0`. پاسخ‌ها: `200 {
settings }` · `400` برای JSON نامعتبر · `422` برای خطای اعتبارسنجی.

---

## گردش کار سرتاسری با curl

```sh
BASE=http://localhost:3000/api/v1

# 0. بررسی سرویس و موتورها
curl -s "$BASE/health"
curl -s "$BASE/languages" | python3 -m json.tool

# 1. ساخت یک آزمایش
EXP=$(curl -s -X POST "$BASE/experiments" -H "Content-Type: application/json" -d '{
  "name": "Sorting shootout",
  "description": "merge vs std sort, three languages",
  "config": {
    "variants": ["sorting.merge_sort", "sorting.std_sort"],
    "languages": ["cpp", "java", "python"],
    "datasetType": "random_int",
    "inputSizes": [10000],
    "repetitions": 5
  }
}' | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
echo "experiment: $EXP"

# 2. شروع یک run (کد 202 → runId؛ اجرا سری و asynchronous است)
RUN=$(curl -s -X POST "$BASE/experiments/$EXP/run" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['runId'])")
echo "run: $RUN"

# 3. poll تا رسیدن به COMPLETED / FAILED / CANCELLED
while :; do
  STATUS=$(curl -s "$BASE/runs/$RUN" | python3 -c "import json,sys; print(json.load(sys.stdin)['status'])")
  echo "status: $STATUS"
  case "$STATUS" in COMPLETED|FAILED|CANCELLED) break;; esac
  sleep 5
done

# دنباله زنده لاگ (افزایشی): GET "$BASE/runs/$RUN?afterLogId=<شناسه آخرین log>"

# 4. نتایج همراه آمار، وضعیت راستی‌آزمایی و مشاهدات خام
curl -s "$BASE/experiments/$EXP/results?runId=$RUN" | python3 -m json.tool | less

# 5. اجرای مجدد همان آزمایش برای ساخت جفت baseline/candidate
RUN2=$(curl -s -X POST "$BASE/experiments/$EXP/run" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['runId'])")
# … به همان شکل poll کنید …

# 6. مقایسه رگرسیون بین دو run
curl -s "$BASE/comparisons?baseline=$RUN&candidate=$RUN2" | python3 -m json.tool

# 7. گزارش markdown (فرمتهای دیگر: json و csv)
curl -s -X POST "$BASE/reports" -H "Content-Type: application/json" \
  -d "{\"runId\": \"$RUN2\", \"format\": \"markdown\"}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['content'])"

# 8. تحلیل اختیاری هوش مصنوعی برای یک run تمام‌شده
curl -s -X POST "$BASE/ai/analysis" -H "Content-Type: application/json" \
  -d "{\"runId\": \"$RUN2\"}"
curl -s "$BASE/ai/analysis?runId=$RUN2" | python3 -m json.tool | less
```

در صورت نیاز، لغو اجرا:

```sh
curl -s -X POST "$BASE/experiments/$EXP/cancel"
```
