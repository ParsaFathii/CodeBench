# نصب و راه‌اندازی CodeBench

این سند نصب کامل پلتفرم را از صفر تا اجرای dev server توضیح می‌دهد: پیش‌نیازها،
راه‌اندازی سه هارنس اندازه‌گیری (Google Benchmark، JMH، pyperf)، ساخت دیتابیس
SQLite و اجرای سرور. منطق دنباله‌شده در این سند همان منطق
`scripts/setup-toolchain.sh` است.

## پیش‌نیازها

| ابزار | نسخه استفاده‌شده در توسعه | برای چه چیزی لازم است |
|---|---|---|
| Node.js / bun | Node 24، bun 1.3 | وب‌اپلیکیشن، coordinator، اسکریپت‌ها |
| g++ | 14.2 (هر کامپایلر C++20) | موتور C++ با `-std=c++20 -O2` |
| Temurin JDK | 21 | موتور Java (javac + JMH) — با `CODEBENCH_JDK_HOME` معرفی شود |
| python3 | 3.12 | موتور Python |
| pyperf | 2.10.0 (`pip install pyperf`) | هارنس Python |
| cmake | نسخه اخیر | build کردن Google Benchmark برای هارنس C++ |
| git | — | clone وابستگی‌ها و مخزن |

نکته مهم درباره JDK: فقط JRE کافی نیست؛ موتور Java هنگام آماده‌سازی، کلاس‌ها را
با `javac` و annotation processor مربوط به JMH کامپایل می‌کند، پس یک JDK کامل
لازم است. اگر `javac` در PATH نباشد، wrapper ها سراغ `$CODEBENCH_JDK_HOME/bin/javac`
می‌روند.

## نصب

```sh
git clone https://github.com/ParsaFathii/CodeBench.git
cd CodeBench
bun install
```

## راه‌اندازی هارنس‌ها

اسکریپت `scripts/setup-toolchain.sh` چهار مرحله را انجام می‌دهد: نصب پکیج‌های
Python، دانلود JDK 21، فراهم کردن jarهای JMH و build کردن Google Benchmark.

### مرحله ۱ — پکیج‌های Python: cmake و pyperf

```sh
pip3 install --quiet cmake pyperf
```

cmakeِ نصب‌شده با pip برای build کردن Google Benchmark در مرحله ۴ استفاده می‌شود
و pyperf خودِ هارنس اندازه‌گیری Python است.

### مرحله ۲ — Temurin JDK 21

JDK از API پروژه Adoptium دانلود و در یک دایرکتوری محلی باز می‌شود:

```sh
curl -sL --max-time 300 -o jdk21.tar.gz \
  "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse"
mkdir -p ~/.jdk
tar -xzf jdk21.tar.gz -C ~/.jdk --strip-components=1
```

سپس متغیر محیطی `CODEBENCH_JDK_HOME` را به این مسیر اشاره دهید:

```sh
export CODEBENCH_JDK_HOME="$HOME/.jdk"
```

wrapper موتور Java مسیرهای `$CODEBENCH_JDK_HOME/bin/javac` و
`$CODEBENCH_JDK_HOME/bin/java` را صدا می‌زند. اگر این متغیر تنظیم نشده باشد،
مسیر پیش‌فرض fallback استفاده می‌شود (در محیط توسعه: `/home/z/.jdk`).

### مرحله ۳ — jarهای JMH 1.37 از Maven Central

چهار jar لازم است که مستقیماً از Maven Central دانلود می‌شوند:

```sh
cd engines/java/lib
curl -sL -O "https://repo1.maven.org/maven2/org/openjdk/jmh/jmh-core/1.37/jmh-core-1.37.jar"
curl -sL -O "https://repo1.maven.org/maven2/org/openjdk/jmh/jmh-generator-annprocess/1.37/jmh-generator-annprocess-1.37.jar"
curl -sL -O "https://repo1.maven.org/maven2/net/sf/jopt-simple/jopt-simple/5.0.4/jopt-simple-5.0.4.jar"
curl -sL -O "https://repo1.maven.org/maven2/org/apache/commons/commons-math3/3.6.1/commons-math3-3.6.1.jar"
```

این jarها در مسیر `engines/java/lib/` داخل مخزن commit شده‌اند؛ یعنی موتور Java
به‌محض وجود یک JDK خودکفا است و این مرحله فقط زمانی لازم می‌شود که فایل‌ها حذف
شده باشند یا به‌روزرسانی مورد نظر باشد.

### مرحله ۴ — build کردن Google Benchmark نسخه v1.9.4

```sh
git clone --depth 1 --branch v1.9.4 https://github.com/google/benchmark.git
cd benchmark
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release \
      -DBENCHMARK_ENABLE_TESTING=OFF \
      -DBENCHMARK_ENABLE_GTEST_TESTS=OFF \
      -DBENCHMARK_ENABLE_WERROR=OFF \
      -DBENCHMARK_USE_LIBCXX=OFF
cmake --build build -j2
# خروجی مورد انتظار: build/src/libbenchmark.a
```

تست‌های خود Google Benchmark غیرفعال شده‌اند تا build سبک‌تر باشد؛ تنها artifact
لازم، کتابخانه استاتیک `libbenchmark.a` به‌همراه headerهای پوشه `include/` است.

## مکان‌های مورد انتظار

موتورها مسیر وابستگی‌ها را از `src/lib/bench/engines/paths.ts` می‌خوانند:

| مسیر | محتوا |
|---|---|
| `$CODEBENCH_JDK_HOME` (fallback: `/home/z/.jdk`) | JDK 21 — `bin/javac` و `bin/java` |
| `.cache/benchdeps/benchmark/` | سورس و build گوگل بنچمارک (`include/` و `build/src/libbenchmark.a`) |
| `.cache/bin/` | باینری C++ و کلاس‌های کامپایل‌شده Java — به‌صورت تنبل و با کش mtime ساخته می‌شوند |
| `.cache/tmp/` | دایرکتوری‌های کاری موقت jobها |
| `engines/java/lib/` | jarهای JMH (داخل مخزن) |

پوشه `.cache/` یک کش local است و در `.gitignore` آمده است؛ حذف آن بی‌خطر است و
فقط باعث می‌شود build ها دوباره انجام شوند.

## دیتابیس SQLite

CodeBench از یک فایل SQLite واحد (از طریق Prisma) استفاده می‌کند. مسیر دیتابیس
با متغیر محیطی `DATABASE_URL` در فایل `.env` تعیین می‌شود. برای ساخت یا به‌روزرسانی
schema:

```sh
bun run db:push      # prisma db push — جداول را با schema همگام می‌کند
```

جداول اصلی: `Experiment`، `Run`، `RunLog`، `BenchmarkResult`، `EnvSnapshot`،
`AiAnalysis`، `Report` و `Setting`. اسکیمای کامل در `prisma/schema.prisma` و شرح
هر جدول در [ARCHITECTURE_FA.md](ARCHITECTURE_FA.md).

دستورهای کمکی دیگر:

```sh
bun run db:generate  # بازتولید Prisma Client
bun run db:migrate   # prisma migrate dev
bun run db:reset     # بازنشانی کامل دیتابیس
```

## اجرای dev server

```sh
bun run dev          # سرور توسعه روی پورت 3000
```

بررسی سلامت سرویس و در دسترس بودن هر سه موتور:

```sh
curl -s http://localhost:3000/api/v1/health
curl -s http://localhost:3000/api/v1/languages | python3 -m json.tool
```

در پاسخ `/languages`، برای هر زبان یک entry با فیلد `available` می‌بینید:
`true` یعنی runtime و هارنس آن زبان پیدا و آماده شده‌اند. اگر برای زبانی
`false` بود، بخش عیب‌یابی پایین را ببینید.

## دروازه صحت بین‌زبانی (توصیه‌شده پس از نصب)

پیش از اعتماد به هر عددی، این بررسی را اجرا کنید:

```sh
bun scripts/verify-crosslang.ts
```

خروجی مورد انتظار:

```
20/20 variants consistent across languages, 120 checksum comparisons
CROSS-LANGUAGE VERIFICATION PASSED
```

این اسکریپت برای همه ۲۰ واریانت، checksum کیس‌های ثابت را بین reference پیاده‌سازی
TypeScript و هر سه موتور مقایسه می‌کند؛ هر ناهمخوانی با جزئیات (کیس موردنظر و
مقادیر expected/got) گزارش می‌شود و خروجی غیرصفر برمی‌گردد.

## داده نمونه (اختیاری)

برای پر کردن سریع سیستم با آزمایش‌های نمایشی (نیازمند سرور در حال اجرا):

```sh
bash scripts/seed-demo-data.sh
```

این اسکریپت پنج آزمایش می‌سازد (مرتب‌سازی بین زبان‌ها، جستجو + ساختمان داده،
پیمایش گراف، رشته‌ها + ماتریس، و یک اجرای مجدد مرتب‌سازی برای مقایسه رگرسیون)
و دقیقاً از همان API عمومی استفاده می‌کند که یک کاربر استفاده می‌کند؛ سپس تا
پایان اجراها poll می‌کند.

## عیب‌یابی

- **موتور Java در دسترس نیست (`available: false`)**
  احتمالاً `CODEBENCH_JDK_HOME` تنظیم نشده یا به JDK (و نه JRE) اشاره نمی‌کند.
  با `$CODEBENCH_JDK_HOME/bin/javac -version` بررسی کنید که خروجی `javac 21…` بدهد.
- **موتور C++ در دسترس نیست**
  کتابخانه `.cache/benchdeps/benchmark/build/src/libbenchmark.a` پیدا نشده است؛
  مرحله ۴ راه‌اندازی هارنس‌ها را دوباره اجرا کنید. کامپایل موتور C++ هنگام اولین
  اجرا به‌صورت تنبل انجام می‌شود؛ اگر کامپایلر C++20 ندارید، این مرحله شکست می‌خورد.
- **موتور Python در دسترس نیست**
  `python3 -m pip show pyperf` را بررسی کنید و در صورت نبود، `pip3 install pyperf`
  را اجرا کنید.
- **خطای Prisma هنگام شروع سرور**
  `bun run db:push` را اجرا کنید تا schema ساخته شود.
- **پروسهای هنگ‌کرده بعد از timeout**
  لازم نیست دستی پاک‌سازی کنید؛ coordinator پروسه‌ها را `detached` اجرا می‌کند و
  هنگام timeout سیگنال SIGKILL را به کل process group می‌فرستد.
