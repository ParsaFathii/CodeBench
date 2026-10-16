# معماری

CodeBench یک پلتفرم بنچمارک بین‌زبانی است: workload های قطعی یکسان را در C++
(Google Benchmark)، Java (JMH) و Python (pyperf) اجرا می‌کند، هر observation خام
را در SQLite ذخیره می‌کند و روی آن آمار، مقایسه رگرسیون، گزارش و یک مفسر هوش
مصنوعی اختیاری را لایه‌لایه می‌چیند. این سند اجزای متحرک سیستم و دلیل شکل
گرفتنشان را توضیح می‌دهد.

## نمای کلی اجزا

```
                       Browser
        ┌──────────────────────────────────────────┐
        │  Single-route SPA served at "/"           │
        │  (hash-based view routing, 10 views:      │
        │   workbench, catalog, runner, results,    │
        │   compare, regression, history,           │
        │   environment, ai, settings)              │
        └───────────────────┬──────────────────────┘
                            │  fetch()  /api/v1/*
                            ▼
        ┌──────────────────────────────────────────┐
        │  Next.js App Router — Route Handlers      │
        │  src/app/api/v1/**/route.ts               │
        │  (stateless HTTP façade, force-dynamic)   │
        └───────┬───────────────────┬──────────────┘
                │                   │
                │                   │ read-only paths
                │                   ├────────────► catalog/registry (in-memory)
                │                   ├────────────► statistics (pure functions)
                │                   ├────────────► comparison / reports
                │                   └────────────► AI adapter (optional)
                │ write/execute paths
                ▼
        ┌──────────────────────────────────────────┐
        │  Experiment coordinator                   │
        │  src/lib/bench/coordinator.ts             │
        │  in-process singleton (survives Next.js   │
        │  module reloads via globalThis)           │
        │  state machine:                           │
        │  QUEUED → PREPARING → RUNNING →           │
        │  VERIFYING → ANALYZING →                  │
        │  COMPLETED | FAILED | CANCELLED           │
        └───────┬────────────┬────────────┬────────┘
                │ spawn        │ spawn      │ spawn
                ▼              ▼            ▼
        ┌────────────┐  ┌────────────┐  ┌──────────────────┐
        │ C++ engine │  │ Java engine│  │ Python engine    │
        │ engines/   │  │ engines/   │  │ engines/python/  │
        │ cpp/code-  │  │ java/…     │  │ codebench_       │
        │ bench.cpp  │  │ JMH +      │  │ algorithms.py    │
        │ compiled   │  │ VerifyMain │  │ codebench_bench  │
        │ with g++   │  │            │  │ .py (pyperf)     │
        │ -std=c++20 │  │            │  │                  │
        │ -O2 + GB   │  │            │  │                  │
        └─────┬──────┘  └─────┬──────┘  └────────┬─────────┘
              │               │                  │
              │  verify sidecar (FNV-1a 64) + harness JSON output
              ▼               ▼                  ▼
        ┌──────────────────────────────────────────────────┐
        │  Prisma Client → SQLite (file)                    │
        │  Experiment, Run, RunLog, BenchmarkResult,        │
        │  EnvSnapshot, AiAnalysis, Report, Setting         │
        └──────────────────────────────────────────────────┘
```

سرویس worker جداگانه‌ای وجود ندارد. Coordinator درون فرآیند سرور Next.js اجرا
می‌شود، job ها را با spawn کردن زیرپروسه‌های واقعی سیستم‌عامل اجرا می‌کند و تمام
state را در SQLite ذخیره می‌کند تا لایه HTTP بدون state بماند.

## جریان درخواست و داده در یک آزمایش

1. **ساخت (Create)** — `POST /api/v1/experiments` پیکربندی را اعتبارسنجی
   می‌کند (`validateConfig` در `coordinator.ts`)، برای فیلدهای حذف‌شده مقادیر
   پیش‌فرض ذخیره‌شده را جایگزین می‌کند (warmup، repetitions، timeoutMs، seed) و
   آزمایش را با `config` به‌صورت JSON ذخیره می‌کند.
2. **اجرا (Run)** — `POST /api/v1/experiments/{id}/run` تابع `startRun` را صدا
   می‌زند که یک snapshot از محیط می‌گیرد، سطر `Run` می‌سازد و `executeRun` را در
   پس‌زمینه راه می‌اندازد. API بلافاصله `202 { runId }` برمی‌گرداند.
3. **آماده‌سازی (Prepare)** — coordinator باینری C++ را (با کش mtime) و کلاس‌های
   Java را (javac + annotation processor مربوط به JMH، با کش mtime) کامپایل
   می‌کند تا خطای toolchain پیش از هر اندازه‌گیری ظاهر شود.
4. **اجرا (Execute)** — job ها حاصل‌ضرب واریانت‌ها، زبان‌ها و سایزهای انتخابی
   هستند (فقط ترکیب‌هایی که registry آن‌ها را موجود می‌داند). job ها اکیداً
   سری اجرا می‌شوند؛ پیشرفت (`completedJobs/totalJobs` و `currentJob`) پس از هر
   job در سطر `Run` نوشته می‌شود و خطوط خوانا به `RunLog` اضافه می‌شود.
5. **هر job** — wrapper موتور، هارنس را با پارامترهای job در متغیرهای محیطی spawn
   می‌کند (`CB_VARIANT`، `CB_DATASET`، `CB_SIZE`، `CB_SEED`، `CB_WARMUP`،
   `CB_VERIFY_OUT`). موتور ابتدا sidecar راستی‌آزمایی را می‌نویسد (checksum های
   FNV-1a 64 از ورودی و خروجی canonical به‌همراه کیس‌های ثابت کوچک)، سپس
   اندازه‌گیری زمان‌دار را انجام می‌دهد. wrapper خروجی JSON هارنس را به
   `observations` (ns/op، یکی per تکرار اندازه‌گیری‌شده)، `rawOutput`، `verify`
   و `env` نرمال می‌کند و coordinator یک سطر `BenchmarkResult` به‌همراه آمارِ
   محاسبه‌شده از مشاهدات خام ذخیره می‌کند.
6. **راستی‌آزمایی (Verify)** — `verifyRun` checksum کیس‌های ثابت هر موتور را با
   reference پیاده‌سازی TypeScript (`reference.ts`) مقایسه می‌کند و نتایج را بر
   اساس (variant, dataset, size) گروه‌بندی می‌کند تا یکسانی checksum ورودی و
   خروجی بین زبان‌ها الزامی شود. ناهمخوانی نتیجه را `FAILED` می‌کند و ثبت
   می‌شود؛ هیچ‌چیز بی‌صدا حذف نمی‌شود.
7. **تحلیل (Analyze)** — برای نتایجی که ضریب تغییراتشان ۱۰٪ یا بیشتر است هشدار
   پایداری صادر می‌شود؛ run به `COMPLETED` می‌رسد (یا `FAILED` وقتی همه job ها
   شکست خورده باشند).
8. **مصرف (Consume)** — SPA (یا هر client HTTP) با `GET /api/v1/runs/{id}` پیشرفت
   را poll می‌کند و سپس نتایج، مقایسه‌ها، گزارش‌ها و تحلیل هوش مصنوعی را — همگی
   سرو شده از SQLite — می‌خواند.

## چرا هر زبان هارنس خودش را دارد

سه هارنس قابل‌تعویض نیستند؛ هرکدام به این دلیل وجود دارد که runtime مربوط به خودش
خطرهای اندازه‌گیری مخصوص دارد:

- **C++ — Google Benchmark.** برنامه به‌صورت ahead-of-time کامپایل می‌شود، پس
  warm-up مربوط به JIT وجود ندارد؛ دشمن اینجا خود بهینه‌ساز است: نتایج بلااستفاده
  حذف و store ها در register نگه داشته می‌شوند. Google Benchmark ابزارهای
  `DoNotOptimize` / `ClobberMemory` را می‌دهد (هر دو در `codebench.cpp` استفاده
  شده‌اند) و چارچوب repetition (`--benchmark_repetitions`) که تجمیع هر تکرار را
  گزارش می‌کند. CodeBench علاوه بر آن، یک حلقه گرم‌سازی بدون زمان‌سنجی قبل از
  سپردن کنترل به هارنس اضافه می‌کند تا cache ها و branch predictor گرم باشند.
- **Java — JMH.** JVM متدهای داغ را در زمان اجرا کامپایل می‌کند؛ زمان‌سنجی
  اولین فراخوانی‌ها یعنی اندازه‌گیری interpreter بهجای برنامه. warm-up iteration
  های JMH (`-wi` که هر کدام `-w 1s` هستند) متد اندازه‌گیری‌شده را به حالت پایدارِ
  کامپایل‌شده می‌رسانند، حالت single-fork (`-f 1`) آزمایش را در یک JVM تازه
  ایزوله می‌کند و مصرف `Blackhole` جلوی حذف کد مرده را می‌گیرد. JMH دقیقاً به
  همین دلیل‌های مرتبط با JIT، هارنس مرجع microbenchmark در جاوا است.
- **Python — pyperf.** CPython JIT ندارد، اما نویز سطح interpreter (GC، وضعیت
  سیستم، گرم شدن allocator) قابل توجه است. pyperf بنچمارک را در یک worker
  process ایزوله دوباره اجرا می‌کند، حلقه‌های زمان‌سنجی را کالیبره می‌کند و پیش
  از جمع‌آوری مقادیر اندازه‌گیری‌شده (`-n`)، مقادیر warm-up (`-w`) می‌گیرد.
  CodeBench مقدار `-p 1` را ثابت کرده تا هر job یک پروسه باشد و
  `--inherit-environ` را پاس می‌دهد تا worker پارامترهای job را ببیند — بدون این
  گزینه، عملیات زمان‌دار بی‌صدا با پارامترهای پیش‌فرض اجرا می‌شد (یک باگ واقعی
  که در طول توسعه پیدا و رفع شد).

تحمیل یک حلقه زمان‌سنجی دست‌ساز واحد به هر سه زبان یا warm-up مربوط به JVM را
خراب مدیریت می‌کرد یا overhead غیراصولی اضافه می‌کرد. استفاده از هارنس استاندارد
هر اکوسیستم یعنی هر زبان به همان روشی اندازه‌گیری می‌شود که معمولاً آن زبان
اندازه‌گیری می‌شود.

آنچه مشترک است، *قرارداد* است: تولید ورودی یکسان (SplitMix64)، کدگذاری
خروجی canonical یکسان (FNV-1a 64) و تعریف یکسان عملیات اندازه‌گیری‌شده (در
[BENCHMARK_METHODOLOGY_FA.md](BENCHMARK_METHODOLOGY_FA.md)).

## طراحی ذخیره‌سازی SQLite

یک دیتابیس SQLite واحد (از طریق Prisma، `DATABASE_URL`) همه چیز را نگه
می‌دارد؛ schema در `prisma/schema.prisma` است.

| مدل | کاربرد | فیلدهای کلیدی |
|---|---|---|
| `Experiment` | تعریف بنچمارک قابل بازتولید | `name`، `description`، `config` (JSON از `ExperimentConfig`) |
| `Run` | یک اجرا از یک آزمایش | `status`، `progress`، `totalJobs` / `completedJobs` / `failedJobs`، `currentJob`، `commitSha`، `envSnapshotId` |
| `RunLog` | خطوط console زنده | `runId`، `ts`، `level` (info/success/warn/error)، `message` |
| `BenchmarkResult` | یک job از نوع (variant, language, size) | `observations` (آرایه JSON از اعداد، ns/op خام هر تکرار)، `statsJson`، checksum ها (`inputChecksumHex`، `jobChecksumHex`، `casesJson`)، `verificationStatus`، `refMatch`، `crossLangMatch`، `rawOutput` (خروجی دست‌نخورده هارنس، سقف ۴۰۰,۰۰۰ کاراکتر)، `envJson`، `extraMetricsJson` (مثل `gc.alloc.rate.norm` مربوط به JMH)، `status` (COMPLETED/FAILED/TIMEOUT) |
| `EnvSnapshot` | مشخصات ماشین/runtime هر run | سیستم‌عامل، معماری، مدل/تعداد هسته CPU، حافظه کل، runtime میزبان، `commitSha`، `metadataJson` (بار سیستم، یادداشت‌ها، سیاست ایزولاسیون) |
| `AiAnalysis` | تفسیر اختیاری LLM | `provider`، `model`، `status`، `inputJson` (دقیقاً همان payload شواهد ارسال‌شده)، `outputJson` (خروجی ساختاریافته اعتبارسنجی‌شده)، `error` |
| `Report` | گزارش‌های JSON/CSV/Markdown تولیدشده | `format`، `filename`، `content` |
| `Setting` | تنظیمات برنامه (کلید/مقدار JSON) | پیکربندی ارائه‌دهنده هوش مصنوعی، پیش‌فرض‌های آزمایش، آستانه رگرسیون |

تصمیم‌های طراحیِ شایان ذکر:

- **مشاهدات خام منبع حقیقت‌اند.** هر تکرار ذخیره می‌شود؛ تمام آمارها مشتق‌شده و
  کنارشان ذخیره می‌شوند (`statsJson`) اما همیشه از `observations` قابل بازمحاسبه‌اند.
- **خروجی خام هارنس حفظ می‌شود** (با سقف مشخص) تا هر نتیجه در برابر آنچه
  Google Benchmark / JMH / pyperf واقعاً چاپ کرده‌اند قابل ممیزی باشد.
- **نام‌های غیرنرمال‌شده** (`algorithmName`، `variantName`، `category`) روی هر
  نتیجه کپی می‌شوند تا سطرهای تاریخی حتی با تکامل registry خوانا بمانند.
- **snapshot محیط per-run است**، نه سراسری، تا مقایسه‌ها بتوانند تشخیص دهند دو run
  روی سخت‌افزار متفاوت اجرا شده‌اند (پرچم `environment-differs` در مقایسه‌ها).

## سیاست ایزولاسیون

- **اجرای سری.** در هر لحظه حداکثر یک run فعال است (`activeRunId` / `queueBusy`
  در coordinator). فراخوانی دوم `POST …/run` حین اجرای یک run با `409` رد می‌شود.
  اندازه‌گیری‌های سنگین هرگز با هم هم‌پوشانی نمی‌شوند.
- **یک پروسه سیستم‌عامل per job.** هر job یک `spawn` تازه از هارنس زبان مربوط است
  (باینری C++، `java` یا `python3`). هیچ state‌ای بین job ها نشت نمی‌کند.
- **kill گروه پروسه هنگام timeout.** پروسه‌ها با `detached: true` (گروه پروسه
  مستقل خودشان) spawn می‌شوند. هنگام timeout سیگنال SIGKILL به `-pid` — کل گروه —
  فرستاده می‌شود تا هیچ fork مربوط به JMH یا worker مربوط به pyperf نتواند از
  والدش زنده بماند. job با وضعیت `TIMEOUT` ثبت می‌شود.
- **سقف capture خروجی.** stdout/stderr فرزند حداکثر ~۲ مگابایت per استریم است؛
  `rawOutput` ذخیره‌شده سقف ۴۰۰,۰۰۰ کاراکتر دارد.
- **تعمیر run های stale.** هنگام `POST …/run` و `GET /api/v1/runs`، run هایی که
  به دلیل restart سرور در وضعیت اجرا مانده‌اند با پیام صریح `FAILED` می‌شوند و
  رها نمی‌شوند.
- **coordinator با وب‌سرور هم‌میزبان است.** این یک محدودیت شناخته‌شده است، نه یک
  فرض پنهان: job های بنچمارک و وب‌اپ روی یک host و در یک فرآیند اجرا می‌شوند
  (اجرا در تسک‌های async پس‌زمینه انجام می‌شود، پس درخواست‌های API هرگز بلاک
  نمی‌شوند، اما رقابت CPU با خود وب‌اپ روی ماشین‌های پرمشغله ممکن است).

## لایه هوش مصنوعی چیست (و چیست نیست)

زیرسیستم هوش مصنوعی (`src/lib/ai/`) یک مفسر فقط-خواندنی و اختیاری است. یک payload
شواهد که منحصراً از سطرهای ذخیره‌شده دیتابیس ساخته می‌شود دریافت می‌کند، یک تحلیل
JSON اعتبارسنجی‌شده با schema برمی‌گرداند و فقط در جدول `AiAnalysis` می‌نویسد. هیچ
مسیر کدی که بتواند رکوردهای بنچمارک، run یا نتیجه را تغییر دهد وجود ندارد. جزئیات
در [AI_INSIGHTS_FA.md](AI_INSIGHTS_FA.md).
