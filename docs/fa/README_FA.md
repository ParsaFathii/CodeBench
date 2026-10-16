# CodeBench — پلتفرم بنچمارک و تحلیل عملکرد الگوریتم‌ها بین زبان‌های برنامه‌نویسی

CodeBench یک پلتفرم بنچمارک بین‌زبانی است: workload های قطعی و یکسان را در سه زبان
C++ و Java و Python اجرا می‌کند، تمام مشاهدات خام اندازه‌گیری را در SQLite ذخیره
می‌کند و روی آن لایه‌هایی از آمار، مقایسه بین‌زبانی، تشخیص رگرسیون، گزارش‌گیری و
تفسیر هوش مصنوعی (اختیاری) می‌نشاند.

- **نویسنده:** Parsa Fathi — [ParsaFathii](https://github.com/ParsaFathii)
- **مخزن:** https://github.com/ParsaFathii/CodeBench
- **مجوز:** Apache-2.0 — حق نشر © 2026 Parsa Fathi

## CodeBench چه می‌کند

هر آزمایش (experiment) ترکیبی از واریانت‌های الگوریتم، زبان‌ها و اندازه‌های ورودی
است. هنگام اجرا، پلتفرم برای هر ترکیب، یک job مستقل می‌سازد، آن را با هارنس رسمی
همان زبان اندازه می‌گیرد و پیش از اندازه‌گیری، صحت پیاده‌سازی را با checksum راستی‌آزمایی
می‌کند. عددی که بدون راستی‌آزمایی موفق تولید شده باشد، «اندازه‌گیری» محسوب نمی‌شود.

سه اصل، طراحی کل پروژه را تعیین کرده است:

1. **ورودی‌های قطعی و یکسان بین زبان‌ها.** همه دیتاست‌ها از یک PRNG مشترک
   (SplitMix64) با پیاده‌سازی bit-identical در TypeScript و C++ و Java و Python
   ساخته می‌شوند؛ برای یک `(dataset, n, seed)` مشخص، هر چهار پیاده‌سازی دقیقاً
   یک ورودی یکسان تولید می‌کنند.
2. **خروجی‌های canonical و قابل مقایسه.** خروجی هر الگوریتم به یک شکل استاندارد
   کدگذاری و با FNV-1a 64 چک‌سام می‌شود. پس از هر اجرا، checksum ورودی و خروجی
   بین هر سه زبان باید یکسان باشد؛ در غیر این صورت نتیجه باطل اعلام می‌شود.
3. **مشاهدات خام، منبع حقیقت.** هر تکرار اندازه‌گیری به‌صورت یک عدد ns/op
   ذخیره می‌شود. تمام آمارها (میانه، میانگین، انحراف معیار، صدک‌ها و…) داده‌های
   مشتق‌شده هستند و همیشه می‌توان آن‌ها را از مشاهدات خام بازمحاسبه کرد.

## موارد استفاده عملی

- **مقایسه زبان‌ها برای یک workload مشخص:** مثلاً نسبت زمان merge sort دست‌نویس در
  C++ و Java و Python روی دیتاست `random_int` با n=100,000.
- **مقایسه الگوریتم‌ها در یک زبان:** مثلاً تفاوت i-j-k و i-k-j در ضرب ماتریس، یا
  جستجوی خطی در برابر hash lookup.
- **پایش رگرسیون:** اجرای تکراری یک آزمایش ثابت و مقایسه دو run برای تشخیص
  افت یا بهبود عملکرد، با آستانه معناداری و نوسان ناشی از نویز.
- **مطالعه رفتار مقیاس‌بندی:** نمودار log-log زمان اجرا بر حسب اندازه ورودی، که
  پیچیدگی مجانبی را به‌صورت بصری نشان می‌دهد.
- **تولید گزارش قابل استناد:** خروجی JSON / CSV / Markdown شامل آمار، مشاهدات
  خام، وضعیت راستی‌آزمایی، snapshot محیط و محدودیت‌ها.
- **تفسیر با هوش مصنوعی (اختیاری):** تحلیل ساختاریافته و مبتنی بر شواهدِ ذخیره‌شده،
  با اعتبارسنجی grounding — بدون هیچ دسترسی نوشتنی به داده‌های اندازه‌گیری.

## معماری در یک نگاه

```
Browser (SPA تک‌صفحه‌ای، ۱۰ نما)
        │  fetch() /api/v1/*
        ▼
Next.js App Router — Route Handlers (لایه HTTP بدون state)
        │
        ▼
Experiment Coordinator (درون فرآیند سرور: صف سری، spawn زیرپروسه‌ها)
        │
        ├──► C++ engine  (Google Benchmark)
        ├──► Java engine (JMH)
        └──► Python engine (pyperf)
        │
        ▼
Prisma + SQLite (Experiment, Run, RunLog, BenchmarkResult,
EnvSnapshot, AiAnalysis, Report, Setting)
```

هیچ سرویس worker جداگانه‌ای وجود ندارد؛ coordinator درون فرآیند Next.js اجرا
می‌شود، job ها را با زیرپروسه‌های واقعی سیستم‌عامل spawn می‌کند و همه state را در
SQLite ذخیره می‌کند تا لایه HTTP بدون state بماند. شرح کامل در
[ARCHITECTURE_FA.md](ARCHITECTURE_FA.md).

## زبان‌ها و هارنس‌ها

هر زبان با هارنس استاندارد همان اکوسیستم اندازه‌گیری می‌شود — نه با یک حلقه
زمان‌سنجی دست‌ساز واحد:

| زبان | استاندارد | هارنس | دلیل انتخاب |
|---|---|---|---|
| C++ | C++20 (g++ 14.2, `-O2`) | Google Benchmark v1.9.4 | `DoNotOptimize` / `ClobberMemory` برای مهار بهینه‌ساز، چارچوب repetition |
| Java | Java 21 (Temurin JDK) | JMH 1.37 | گرم‌سازی JIT، fork جداگانه، `Blackhole` — هارنس مرجع microbenchmark در جاوا |
| Python | CPython 3.12 | pyperf 2.10.0 | اجرای ایزوله در worker process، کالیبراسیون حلقه زمان‌سنجی، مقادیر warm-up |

آنچه بین زبان‌ها مشترک است «قرارداد» است: تولید ورودی یکسان (SplitMix64)،
کدگذاری خروجی یکسان (FNV-1a 64) و تعریف یکسانِ عملیات اندازه‌گیری‌شده. جزئیات در
[BENCHMARK_METHODOLOGY_FA.md](BENCHMARK_METHODOLOGY_FA.md).

## شروع سریع

### پیش‌نیازها

- Node.js یا bun (نسخه‌های استفاده‌شده در توسعه: Node 24، bun 1.3)
- g++ با پشتیبانی C++20
- JDK 21 (Temurin) — با متغیر محیطی `CODEBENCH_JDK_HOME` معرفی می‌شود
- python3 (3.12) به‌همراه pyperf
- cmake (برای build کردن Google Benchmark)

### راه‌اندازی

```sh
git clone https://github.com/ParsaFathii/CodeBench.git
cd CodeBench

# ابزارهای سنگین شخص ثالث (pyperf + cmake، JDK 21، JMH jars، Google Benchmark)
bash scripts/setup-toolchain.sh

bun install          # وابستگی‌های پروژه
bun run db:push      # ساخت schema دیتابیس SQLite (prisma db push)
bun run dev          # dev server روی پورت 3000
```

نکته: فایل‌های jar مربوط به JMH در مسیر `engines/java/lib/` داخل مخزن
commit شده‌اند؛ بنابراین موتور Java با وجود یک JDK کامل خودکفا است و مرحله دانلود
JMH فقط در صورت حذف آن فایل‌ها لازم می‌شود. شرح کامل نصب و مکان دقیق هر
وابستگی در [INSTALLATION_FA.md](INSTALLATION_FA.md).

### اجرای اولین آزمایش

پس از بالا آمدن سرور، `http://localhost:3000` را باز کنید:

1. در نمای **Workbench** یک آزمایش بسازید: نام، انتخاب واریانت‌ها (مثلاً
   `sorting.merge_sort` و `sorting.std_sort`)، زبان‌ها، دیتاست و اندازه‌های ورودی.
2. سیاست اندازه‌گیری را تنظیم کنید: warm-up، تعداد تکرار، seed و timeout.
3. اجرا کنید و در نمای **Runner** پیشرفت واقعی job ها و خروجی console را ببینید.
4. در نمای **Results** آمار، مشاهدات خام و وضعیت راستی‌آزمایی را بررسی کنید.

معادل همین کار با API و curl:

```sh
BASE=http://localhost:3000/api/v1
EXP=$(curl -s -X POST "$BASE/experiments" -H "Content-Type: application/json" -d '{
  "name": "اولین آزمایش",
  "config": {
    "variants": ["sorting.std_sort"],
    "languages": ["cpp", "java", "python"],
    "datasetType": "random_int",
    "inputSizes": [10000],
    "repetitions": 5
  }
}' | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")

curl -s -X POST "$BASE/experiments/$EXP/run"
curl -s "$BASE/experiments/$EXP/results" | python3 -m json.tool | less
```

قبل از اعتماد به هر عددی، دروازه صحت بین‌زبانی را یک بار اجرا کنید:

```sh
bun scripts/verify-crosslang.ts
# خروجی مورد انتظار: 20/20 variants consistent, 120 checksum comparisons
# CROSS-LANGUAGE VERIFICATION PASSED
```

## کاتالوگ الگوریتم‌ها

۲۰ واریانت در ۶ خانواده — مرتب‌سازی (۵)، جستجو (۳)، ساختمان‌های داده (۵)،
گراف (۳)، رشته‌ها (۲) و ماتریس (۲) — هر یک در هر سه زبان پیاده‌سازی و با یک
reference پیاده‌سازی TypeScript راستی‌آزمایی شده است. جدول کامل همراه پیچیدگی،
دیتاست‌ها، اندازه‌های پیش‌فرض و «عملیات اندازه‌گیری‌شده» در
[ALGORITHMS_FA.md](ALGORITHMS_FA.md).

## ساختار پروژه

```
engines/
  cpp/                    موتور C++ (Google Benchmark)
  java/                   موتور Java (JMH + VerifyMain + jarهای commit شده)
  python/                 موتور Python (pyperf)
src/lib/bench/            هسته دامنه: spec، registry، prng، reference،
                          stats، coordinator، comparison، reports
src/lib/ai/               لایه هوش مصنوعی (provider + analyze)
src/app/api/v1/           همه endpointهای HTTP
src/components/bench/     رابط کاربری SPA (shell، views، charts)
prisma/schema.prisma      schema دیتابیس SQLite
scripts/                  verify-crosslang.ts و seed-demo-data.sh
docs/                     مستندات انگلیسی
docs/fa/                  مستندات فارسی (همین مجموعه)
```

## مستندات فارسی

| سند | محتوا |
|---|---|
| [INSTALLATION_FA.md](INSTALLATION_FA.md) | نصب کامل: پیش‌نیازها، راه‌اندازی هارنس‌ها، دیتابیس، اجرای سرور |
| [USER_GUIDE_FA.md](USER_GUIDE_FA.md) | راهنمای کاربری: شرح ۱۰ نما و چرخه کامل کار |
| [ARCHITECTURE_FA.md](ARCHITECTURE_FA.md) | معماری: اجزا، جریان داده، طراحی ذخیره‌سازی، ایزولاسیون |
| [BENCHMARK_METHODOLOGY_FA.md](BENCHMARK_METHODOLOGY_FA.md) | روش‌شناسی اندازه‌گیری: warm-up، آمار، outlier، ورودی قطعی، راستی‌آزمایی |
| [ALGORITHMS_FA.md](ALGORITHMS_FA.md) | کاتالوگ کامل ۲۰ واریانت در ۶ خانواده |
| [RESULTS_AND_STATISTICS_FA.md](RESULTS_AND_STATISTICS_FA.md) | تفسیر نتایج و آمارها، خواندن نمودارها |
| [AI_INSIGHTS_FA.md](AI_INSIGHTS_FA.md) | دستیار هوش مصنوعی: ارائه‌دهنده‌ها، شواهد، اعتبارسنجی |
| [API_FA.md](API_FA.md) | مرجع کامل API با مثال curl |
| [DEVELOPMENT_FA.md](DEVELOPMENT_FA.md) | راهنمای توسعه‌دهنده: دستورات، ساختار، افزودن واریانت جدید |
| [RELEASE_FA.md](RELEASE_FA.md) | فرایند انتشار: نسخه‌ها، CHANGELOG، release در GitHub |
| [COPYRIGHT_FA.md](COPYRIGHT_FA.md) | حق نشر و مجوزها |

نسخه انگلیسی همین مستندات در پوشه [docs/](../) موجود است.
