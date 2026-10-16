# فرایند انتشار (Release)

این سند نحوه نسخه‌گذاری، ثبت تغییرات و ساخت یک release رسمی CodeBench در GitHub را
توضیح می‌دهد — از دروازه‌های کیفی پیش از انتشار تا آرتیفکت‌های پیوست‌شده به هر
release.

## نسخه‌گذاری

پلتفرم از نسخه‌بندی معنایی (Semantic Versioning: `MAJOR.MINOR.PATCH`) پیروی
می‌کند و نسخه فعلی سرویس از طریق `GET /api/v1/health` در فیلد `version` قابل
استعلام است:

```sh
curl -s http://localhost:3000/api/v1/health | python3 -m json.tool
```

- **PATCH:** رفع باگ، بهبود مستندات، تغییرات داخلی بدون اثر بر رفتار قابل مشاهده.
- **MINOR:** افزودن واریانت‌های الگوریتمی جدید، endpoint یا قابلیت جدید — با
  حفظ سازگاری به عقب. افزودن واریانت به کاتالوگ (`workloadSpecVersion` جداگانه
  خودش را دارد) یا تغییر پیش‌فرض‌های قابل‌توجه، در این سطح منتشر می‌شود.
- **MAJOR:** تغییرات ناسازگار در API قراردادی، schema دیتابیس یا تعریف workload
  که بازتولید یا تفسیر نتایج قبلی را متأثر می‌کند.

نسخه workload — یعنی قرارداد ورودی/خروجی الگوریتم‌ها که با checksum راستی‌آزمایی
می‌شود — از نسخه پلتفرم مستقل است (`workloadSpecVersion` در پاسخ
`/api/v1/algorithms`). تغییر در مولدهای دیتاست یا کدگذاری خروجی canonical،
افزایش این نسخه را الزامی می‌کند؛ در غیر این صورت نتایج runهای قدیمی و جدید قابل
مقایسه نیستند.

## CHANGELOG

هر انتشار باید یک مدخل در `CHANGELOG.md` (در ریشه مخزن، به سبک Keep a Changelog)
داشته باشد. ساختار توصیه‌شده:

```markdown
## [1.1.0] — 2026-02-01
### Added
- واریانت جدید `strings.boyer_moore` در هر سه زبان (+ ۶ مقایسه checksum جدید در دروازه)
### Changed
- پیش‌فرض repetitions از ۵ به ۷ تغییر کرد
### Fixed
- نشت مقادیر env در worker مربوط به pyperf برطرف شد
```

قاعده مهم: هر تغییری که تعریف workload یا قابلیت مقایسه نتایج را تغییر می‌دهد
(دیتاست، seed پیش‌فرض، قرارداد عملیات اندازه‌گیری‌شده، نحوه محاسبه آمار) باید
**صریح** در CHANGELOG ذکر شود، چون کاربران برای مقایسه runهای تاریخی به آن تکیه
می‌کنند.

## پیش‌نیازهای یک انتشار

پیش از برچسب زدن، همه این موارد باید روی شاخه `main` سبز باشند:

1. `bun run lint` — بدون خطا.
2. `bun scripts/verify-crosslang.ts` — دروازه صحت بین‌زبانی پاس شود
   (خروجی مورد انتظار: `20/20 variants consistent, 120 checksum comparisons` و
   `CROSS-LANGUAGE VERIFICATION PASSED`).
3. یک اجرای دود سرتاسری: `bun run dev` و سپس `bash scripts/seed-demo-data.sh` —
   همه آزمایش‌ها باید با وضعیت COMPLETED و راستی‌آزمایی PASSED تمام شوند.
4. `bun run db:push` روی یک دیتابیس تازه، بدون خطا اجرا شود.

## workflowها

کیفیت انتشار توسط workflowهای CI در `.github/workflows/` پشتیبانی می‌شود که روی
هر push و pull request اجرا می‌شوند. وظایف اصلی هر workflow:

- **lint:** نصب وابستگی‌ها با bun و اجرای `bun run lint`.
- **verify:** راه‌اندازی toolchain (g++ با C++20، ‏JDK 21 و
  `CODEBENCH_JDK_HOME`، ‏python3 + pyperf و cmake برای build گوگل بنچمارک) و اجرای
  `bun scripts/verify-crosslang.ts` — همان دروازه صحت که پیش از اعتماد به هر
  زمان‌سنجی لازم است.
- **build:** ‏`bun install` و بررسی سالم بودن build پروژه.

این workflowها همان دروازه‌هایی هستند که در «پیش‌نیازهای یک انتشار» فهرست شد؛
release فقط از یک شاخه‌ای ساخته می‌شود که همه آنها رویش پاس شده باشند.

## ساخت release در GitHub

1. شماره نسخه را در `CHANGELOG.md` ثبت و تاریخ آن را نهایی کنید و روی `main`
   commit کنید.
2. یک tag معنایی بسازید و push کنید:

   ```sh
   git tag -a v1.1.0 -m "CodeBench v1.1.0"
   git push origin v1.1.0
   ```

3. در صفحه Releases مخزن
   (https://github.com/ParsaFathii/CodeBench/releases) با دکمه
   **Draft a new release** یک انتشار جدید بسازید، tag را انتخاب کنید و متن
   مدخل CHANGELOG مربوط به همان نسخه را (به‌همراه محیط اجرای آرتیفکت‌ها: مدل
   CPU، سیستم‌عامل، نسخه‌های کامپایلر و هارنس‌ها) در توضیحات بیاورید.
4. آرتیفکت‌ها را (بخش بعد) پیوست و انتشار را منتشر کنید.

## آرتیفکت‌های هر release

هر release شامل بسته‌های خروجی قابل ممیزی است:

- **گزارش‌های مرجع:** از یک run نمایشی روی محیط مستندشده، در هر سه قالب
  ‏JSON / CSV / ‏Markdown از طریق API تولید و ذخیره می‌شوند:

  ```sh
  curl -s -X POST http://localhost:3000/api/v1/reports \
    -H "Content-Type: application/json" \
    -d '{"runId": "<RUN_ID>", "format": "json"}' > report.json
  curl -s -X POST http://localhost:3000/api/v1/reports \
    -H "Content-Type: application/json" \
    -d '{"runId": "<RUN_ID>", "format": "markdown"}' > report.md
  curl -s -X POST http://localhost:3000/api/v1/reports \
    -H "Content-Type: application/json" \
    -d '{"runId": "<RUN_ID>", "format": "csv"}' > report.csv
  ```

  گزارش‌ها عمداً خروجی هوش مصنوعی را شامل نمی‌شوند؛ همه اعداد آنها از مشاهدات
  خام ذخیره‌شده مشتق می‌شود.
- **checksum مربوط به SHA256:** برای هر فایل پیوست‌شده، checksum محاسبه و در
  فایل `SHA256SUMS` کنار آنها قرار می‌گیرد:

  ```sh
  sha256sum report.json report.md report.csv > SHA256SUMS
  ```

  گیرندگان می‌توانند با `sha256sum -c SHA256SUMS` یکپارچگی فایل‌ها را تأیید
  کنند.
- **snapshot محیط:** گزارش‌ها محیط اجرا (CPU، هسته‌ها، بار سیستم، نسخه‌های هارنس)
  را در بر دارند؛ توضیحات release هم باید همین اطلاعات را خلاصه کند تا اعداد
  پیوست‌شده قابل تفسیر بمانند — این اعداد مختص همان محیط‌اند، نه رتبه‌بندی
  جهانی زبان‌ها.

## پس از انتشار

- لینک release را در CHANGELOG (در عنوان مدخل، به سبک Keep a Changelog) اضافه
  کنید.
- اگر نسخه، تغییر قرارداد workload داشته، مطمئن شوید `workloadSpecVersion` در
  توضیحات ذکر شده و مستندات فارسی و انگلیسیِ روش‌شناسی به‌روز شده‌اند.
- مسائل مشاهده‌شده پس از انتشار، در بخش Issues مخزن ثبت و در نسخه بعدی پیگیری
  می‌شوند.
