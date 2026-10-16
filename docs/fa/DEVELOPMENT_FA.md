# راهنمای توسعه‌دهنده

نحوه راه‌اندازی یک محیط توسعه کارا برای CodeBench، اجرای پلتفرم و توسعه آن با
واریانت‌های الگوریتمی جدید. برای نصب کامل به [INSTALLATION_FA.md](INSTALLATION_FA.md)
مراجعه کنید.

## پیش‌نیازها

| ابزار | نسخه استفاده‌شده | برای چه چیزی لازم است |
|---|---|---|
| Node.js / bun | Node 24، ‏bun 1.3 | وب‌اپ، ‏coordinator، اسکریپت‌ها |
| g++ | 14.2 (هر کامپایلر C++20) | موتور C++ با `-std=c++20 -O2` |
| Temurin JDK | 21 | موتور Java (‏javac + JMH)؛ متغیر `CODEBENCH_JDK_HOME` را تنظیم کنید |
| python3 | 3.12 | موتور Python |
| pyperf | 2.x (`pip install pyperf`) | هارنس Python |
| cmake | نسخه اخیر | build کردن Google Benchmark برای هارنس C++ |

وابستگی‌های سنگین شخص ثالث توسط `scripts/setup-toolchain.sh` فراهم می‌شوند (منطق
گام‌به‌گامش در [INSTALLATION_FA.md](INSTALLATION_FA.md)). توجه کنید که **jarهای JMH
در `engines/java/lib/` داخل مخزن commit شده‌اند**، پس موتور Java با وجود یک JDK
خودکفا است.

## دستورها

```sh
bun install            # وابستگی‌ها
bun run db:push        # ساخت/به‌روزرسانی schema دیتابیس SQLite (prisma db push)
bun run dev            # سرور توسعه روی پورت 3000

bun run lint           # eslint

bun scripts/verify-crosslang.ts   # دروازه صحت بین‌زبانی (در ادامه)

bash scripts/seed-demo-data.sh    # ساخت داده نمایشی از طریق API عمومی
```

اسکریپت `scripts/seed-demo-data.sh` به سرور در حال اجرا نیاز دارد؛ پنج آزمایش
می‌سازد (مرتب‌سازی بین زبان‌ها، جستجو + ساختمان داده، پیمایش گراف، رشته‌ها +
ماتریس، و یک اجرای مجدد مرتب‌سازی برای مقایسه رگرسیون) که دقیقاً مثل یک کاربر
`POST /experiments` و `POST /experiments/{id}/run` را صدا می‌زنند و سپس تا پایان
اجر poll می‌کنند.

سایر دستورهای دیتابیس: `bun run db:generate` (بازتولید Prisma Client)، ‏`bun run
db:migrate` و `bun run db:reset`.

## دروازه صحت بین‌زبانی

```sh
bun scripts/verify-crosslang.ts
```

این همان دروازه‌ای است که **پیش از اعتماد به هر زمان‌سنجی** باید پاس شود. برای
هرکدام از ۲۰ واریانت:

1. checksum کیس‌های ثابت را از reference مربوط به TypeScript محاسبه می‌کند،
2. موتور C++ (با `CB_MODE=verify`)، کلاس `VerifyMain` مربوط به Java و قطعه کد
   راستی‌آزمایی Python را اجرا می‌کند,
3. همه checksum کیس‌های ثابت را بین هر چهار پیاده‌سازی مقایسه می‌کند.

خروجی مورد انتظار: `20/20 variants consistent across languages, 120 checksum
comparisons` و سپس `CROSS-LANGUAGE VERIFICATION PASSED` (کد خروج ۰). هر ناهمخوانی،
دروازه را با ذکر کیس دقیق و مقادیر expected/got شکست می‌دهد.

## ساختار پروژه

```
engines/
  cpp/codebench.cpp        موتور C++: PRNG، دیتاست‌ها، الگوریتم‌ها، هارنس GB،
                           sidecar راستی‌آزمایی، warm-up صریح
  java/src/codebench/
    Algorithms.java        مولدها + الگوریتم‌ها + FNV-1a + کیس‌های راستی‌آزمایی
    Benchmarks.java        متدهای JMH @Benchmark (یکی per واریانت)
    VerifyMain.java        راستی‌آزمای مستقل (JVM ساده، بدون JMH)
  java/lib/                jarهای commit شده JMH (jmh-core 1.37، annprocessor،
                           jopt-simple، commons-math3)
  python/
    codebench_algorithms.py  مولدها + الگوریتم‌ها + checksumها (مشترک)
    codebench_bench.py       اجراکننده pyperf + sidecar راستی‌آزمایی
src/lib/bench/
  spec.ts                  typeهای مشترک، ExperimentConfig، Stats، schema نتیجه
  registry.ts              کاتالوگ الگوریتم‌ها (۲۰ واریانت، ۶ خانواده)
  prng.ts                  SplitMix64 + FNV-1a 64 (مرجع TS قرارداد)
  reference.ts             پیاده‌سازی‌های مرجع TS + مولدهای دیتاست
                           + کیس‌های ثابت راستی‌آزمایی
  stats.ts                 آمار قطعی از مشاهدات خام
  comparison.ts            احکام رگرسیون run-to-run
  coordinator.ts           چرخه حیات run، اجرای سری، راستی‌آزمایی
  reports.ts               تولید گزارش JSON / CSV / Markdown
  env.ts                   capture از snapshot محیط
  settings.ts              تنظیمات ماندگار برنامه
  engines/                 wrapperهای cpp.ts / java.ts / python.ts + paths.ts
src/lib/ai/
  provider.ts              انتزاع ارائه‌دهنده zai / ollama / disabled
  analyze.ts               ساخت شواهد، اعتبارسنجی schema، grounding
src/app/api/v1/           همه endpointهای HTTP (Route Handlerها)
src/components/bench/     SPA تک‌مسیری: shell، views، charts، کلاینت api
prisma/schema.prisma       schema دیتابیس SQLite
scripts/                   verify-crosslang.ts، seed-demo-data.sh
.cache/                    gitignore شده: وابستگی‌های toolchain، باینری‌ها، tmp
```

## افزودن واریانت الگوریتمی جدید

چک‌لیست — یک واریانت فقط وقتی «وجود دارد» که همه این مراحل انجام شده باشد، چون
وعده اصلی پلتفرم، ورودی و خروجی bit-identical بین زبان‌هاست:

1. **reference مربوط به TypeScript** (`src/lib/bench/reference.ts`): الگوریتم را
   پیاده‌سازی کنید و یک case جدید برای `runReference` با کلید واریانت جدید
   اضافه کنید. اگر یک *خانواده* جدید است، به `verifyCasesFor` هم یک case اضافه
   کنید (دیتاست ثابت + اندازه n).
2. **موتور C++** (`engines/cpp/codebench.cpp`): عملیات را در `runOp`، خروجی
   canonical را در `verifyOutput` پیاده‌سازی کنید و واریانت را در فهرست‌های
   خانواده در `main` ثبت کنید (که کیس‌های ثابت راستی‌آزمایی را انتخاب می‌کنند).
3. **موتور Java**: الگوریتم/راستی‌آزمایی در
   `engines/java/src/codebench/Algorithms.java` (شامل `verifyOutput` و
   `verifyCasesJson`)، یک متد `@Benchmark` در `Benchmarks.java` و نگاشت واریانت
   به متد در `VARIANT_TO_METHOD` (در `src/lib/bench/engines/java.ts`).
4. **موتور Python**: پشتیبانی `verify_output` در
   `engines/python/codebench_algorithms.py` و closure عملیات اندازه‌گیری‌شده در
   `make_op` (در `codebench_bench.py`).
5. **ثبت در registry** (`src/lib/bench/registry.ts`): شناسه، نام، دسته
   (دست‌نویس یا کتابخانه استاندارد)، پیچیدگی، متن `measuredOp`، ‏`maxSize`
   اختیاری — همین چیزی است که API و UI سرو می‌کنند.
6. **فهرست دروازه** (`scripts/verify-crosslang.ts`): کلید واریانت را به `VARIANTS`
   اضافه کنید تا زیر پوشش دروازه صحت قرار بگیرد.
7. **اجرای دروازه**: `bun scripts/verify-crosslang.ts` باید برای واریانت جدید
   پاس شود (checksumهای یکسان بین TS / C++ / Java / Python) پیش از آنکه هر
   اجرای بنچمارکی از آن استفاده کند.

قیدهایی که باید در ذهن داشته باشید: قرارداد عملیات اندازه‌گیری‌شده باید با عرف‌های
خانواده هم‌خوان باشد (کپی defensive درون مرتب‌سازی‌های مخرب، ریست آرایه visited
درون پیمایش‌ها، کانتینر تازه per چرخه، ساخت جدول بدون زمان‌سنجی برای lookupها)؛
نتایج باید مصرف شوند (sink / Blackhole / مقدار بازگشتی) تا بهینه‌ساز نتواند کار را
حذف کند؛ کدگذاری خروجی canonical باید یک بار تعیین و همه‌جا آینه شود.

## فلسفه آزمون: صحت قبل از سرعت

- **صحت قبل از زمان‌سنجی.** دروازه بین‌زبانی و راستی‌آزمایی per run (تطابق با
  reference + برابری checksum بین زبان‌ها) آزمون‌های اصلی هستند. عددی که از یک
  پیاده‌سازی راستی‌آزمایی‌نشده تولید شود یک اندازه‌گیری نیست؛ شکست راستی‌آزمایی
  نتیجه را `FAILED` می‌کند و از مقایسه‌ها حذفش می‌کند (`NOT-COMPARABLE`).
- **راستی‌آزمایی در هر run تعبیه شده**، نه یک بررسی یک‌باره در CI: هر موتور
  sidecar خود را روی همان ورودیِ دقیق اندازه‌گیری‌شده پیش از زمان‌سنجی می‌نویسد و
  coordinator پس از run، کیس‌های ثابت را دوباره در برابر reference مربوط به
  TypeScript بررسی می‌کند.
- **داده خام نگه داشته می‌شود.** مشاهدات و خروجی هارنس ذخیره می‌شوند تا هر آماره
  بعداً قابل بازمحاسبه یا ممیزی باشد.
- **آمار، توابع خالص و قطعی هستند** (`stats.ts`) — بدون دخالت هوش مصنوعی، بدون
  تجمیع وابسته به هارنس.
- **اجرای دود سرتاسری است:** یک آزمایش از طریق API عمومی که با پاس شدن همه
  راستی‌آزمایی‌ها کامل شود، آزمون پذیرش تغییرات toolchain یا موتور است
  (`seed-demo-data.sh` دقیقاً همین مسیر را اجرا می‌کند).

## نکته‌هایی درباره coordinator

- coordinator یک singleton درون‌فرآیندی است که از طریق `globalThis` از reload
  شدن ماژول‌های Next.js جان سالم به در می‌برد.
- اجرا اکیداً سری است (`activeRunId` / `queueBusy`)؛ درخواست run دوم حین اجرا با
  خطای `409` رد می‌شود.
- پروسه‌ها با `detached: true` spawn می‌شوند تا هر job گروه پروسه مستقل خودش را
  داشته باشد؛ هنگام timeout سیگنال SIGKILL به کل گروه فرستاده می‌شود تا هیچ
  فرزندی (مثل fork مربوط به JMH یا worker مربوط به pyperf) زنده نماند.
- runهایی که بر اثر restart سرور در وضعیت اجرا مانده‌اند، در فراخوانی بعدی
  `POST …/run` یا `GET /api/v1/runs` با پیام صریح `FAILED` می‌شوند.
