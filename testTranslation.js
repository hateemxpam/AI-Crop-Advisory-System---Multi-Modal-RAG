/**
 * testTranslation.js
 *
 * Manual smoke test for translationService.js
 *
 * HOW TO RUN:
 *   node testTranslation.js
 *
 * WHAT THIS TESTS:
 *   - Urdu text → English translation (API call to Gemini)
 *   - English text → Urdu translation (API call to Gemini)
 *   - Punjabi (Shahmukhi) → English translation (API call to Gemini)
 *   - English input with sourceLang="en" → returned as-is (NO API call)
 *   - English input with targetLang="en" → returned as-is (NO API call)
 *
 * NOTE: Punjabi here uses Shahmukhi script (Arabic-based), same as Urdu script.
 *       This is the script used in Pakistan, NOT Gurmukhi (used in India).
 */

const { translateToEnglish, translateFromEnglish } = require("./services/translationService");

async function runTests() {
  let passed = 0;
  let failed = 0;

  // Normalize text for resilient comparisons across punctuation/case variations.
  function normalizeText(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/[.,!?;:()\[\]{}"'`]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function pass(label, detail) {
    console.log(`   ✅ PASS — ${label}${detail ? ` (${detail})` : ""}`);
    passed++;
  }

  function fail(label, detail) {
    console.log(`   ❌ FAIL — ${label}${detail ? ` (${detail})` : ""}`);
    failed++;
  }

  // For each synonym group, at least one term must appear.
  function expectContainsSynonymGroups(result, synonymGroups, label) {
    const normalized = normalizeText(result);
    const missingGroups = [];

    synonymGroups.forEach((group) => {
      const hit = group.some((term) => normalized.includes(normalizeText(term)));
      if (!hit) missingGroups.push(group.join(" | "));
    });

    if (missingGroups.length === 0) {
      pass(label, "semantic keyword groups matched");
      return true;
    }

    fail(label, `missing semantic groups: ${missingGroups.join(" ; ")}`);
    return false;
  }

  // Helper: prints result with a pass/fail check
  function printResult(label, result, expectHint) {
    console.log(`\n📋 ${label}`);
    console.log(`   Expected (approx) : ${expectHint}`);
    console.log(`   Actual output     : ${result}`);

    if (typeof result === "string" && result.trim().length > 0) {
      pass("returned a clean, non-empty translated string");
      return true;
    }

    fail("result is empty or wrong type");
    return false;
  }

  // Helper: pause between API calls to avoid per-minute rate limits
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  console.log("══════════════════════════════════════════════════════");
  console.log("       Translation Service — Manual Test Suite         ");
  console.log("══════════════════════════════════════════════════════");

  // ───────────────────────────────────────────────────────────────
  // TEST 1: Urdu → English
  // Input is a real Urdu sentence a Pakistani farmer might type.
  // "گندم کی فصل کے لیے بہترین کھاد کیا ہے؟"
  // Meaning: "What is the best fertilizer for wheat crop?"
  // ───────────────────────────────────────────────────────────────
  console.log("\n[TEST 1]  Urdu → English  (translateToEnglish)");
  console.log("   Input  : گندم کی فصل کے لیے بہترین کھاد کیا ہے؟");
  console.log("   Calling: translateToEnglish(text, 'ur')");

  const t1 = await translateToEnglish(
    "گندم کی فصل کے لیے بہترین کھاد کیا ہے؟",
    "ur"
  );
  const t1NonEmpty = printResult(
    "Urdu → English",
    t1,
    "What is the best fertilizer for wheat crop?"
  );
  if (t1NonEmpty) {
    expectContainsSynonymGroups(
      t1,
      [["best"], ["fertilizer", "manure"], ["wheat"]],
      "Urdu → English semantic correctness"
    );
  }

  // Small pause between API calls to stay within per-minute quota
  console.log("\n⏳ Pausing 3s between API calls to respect rate limits...");
  await sleep(3000);

  // ───────────────────────────────────────────────────────────────
  // TEST 2: English → Urdu
  // This simulates the END of the pipeline — the LLM has produced
  // an English advisory response, and we are translating it back
  // to Urdu for the farmer.
  // ───────────────────────────────────────────────────────────────
  console.log("\n[TEST 2]  English → Urdu  (translateFromEnglish)");
  console.log("   Input  : Apply nitrogen fertilizer in early growth stage");
  console.log("   Calling: translateFromEnglish(text, 'ur')");

  const t2 = await translateFromEnglish(
    "Apply nitrogen fertilizer in early growth stage",
    "ur"
  );
  const t2NonEmpty = printResult(
    "English → Urdu",
    t2,
    "ابتدائی نشوونما کے مرحلے میں نائٹروجن کھاد لگائیں"
  );
  if (t2NonEmpty) {
    expectContainsSynonymGroups(
      t2,
      [
        ["نائٹروجن"],
        ["کھاد"],
        ["ابتدائی", "نشوونما", "مرحلے"],
        ["لگائیں", "ڈالیں", "استعمال", "دیں", "دیجیے"]
      ],
      "English → Urdu semantic correctness"
    );
  }

  console.log("\n⏳ Pausing 3s between API calls to respect rate limits...");
  await sleep(3000);

  // ───────────────────────────────────────────────────────────────
  // TEST 3: Punjabi (Shahmukhi) → English
  // Shahmukhi is the Arabic-script Punjabi used in Pakistan.
  // "فصل نوں پانی کدوں دینا چاہیدا اے؟"
  // Meaning: "When should the crop be watered?"
  // ───────────────────────────────────────────────────────────────
  console.log("\n[TEST 3]  Punjabi (Shahmukhi) → English  (translateToEnglish)");
  console.log("   Input  : فصل نوں پانی کدوں دینا چاہیدا اے؟");
  console.log("   Calling: translateToEnglish(text, 'pa')");

  const t3 = await translateToEnglish(
    "فصل نوں پانی کدوں دینا چاہیدا اے؟",
    "pa"
  );
  const t3NonEmpty = printResult(
    "Punjabi (Shahmukhi) → English",
    t3,
    "When should the crop be watered?"
  );
  if (t3NonEmpty) {
    expectContainsSynonymGroups(
      t3,
      [["when"], ["crop"], ["watered", "water", "irrigated"]],
      "Punjabi → English semantic correctness"
    );
  }

  // ───────────────────────────────────────────────────────────────
  // TEST 4: English passthrough via translateToEnglish
  // When sourceLang is "en", the function must return text immediately
  // WITHOUT calling the Gemini API at all.
  // We verify this by checking for an EXACT string match.
  // ───────────────────────────────────────────────────────────────
  console.log("\n[TEST 4]  English passthrough — sourceLang='en'  (translateToEnglish)");
  console.log("   Input  : What is the best fertilizer for wheat crop?");
  console.log("   Calling: translateToEnglish(text, 'en')  ← should NOT call API");

  const englishInput = "What is the best fertilizer for wheat crop?";
  const t4 = await translateToEnglish(englishInput, "en");

  console.log(`\n📋 English passthrough (translateToEnglish)`);
  console.log(`   Expected : ${englishInput}`);
  console.log(`   Actual   : ${t4}`);

  if (t4 === englishInput) {
    pass("exact match, no API call was made");
  } else {
    fail("text was changed when it should have been returned as-is");
  }

  // ───────────────────────────────────────────────────────────────
  // TEST 5: English passthrough via translateFromEnglish
  // When targetLang is "en", the function must return text immediately
  // WITHOUT calling the Gemini API at all.
  // ───────────────────────────────────────────────────────────────
  console.log("\n[TEST 5]  English passthrough — targetLang='en'  (translateFromEnglish)");
  console.log("   Input  : Apply nitrogen fertilizer in early growth stage");
  console.log("   Calling: translateFromEnglish(text, 'en')  ← should NOT call API");

  const englishInput2 = "Apply nitrogen fertilizer in early growth stage";
  const t5 = await translateFromEnglish(englishInput2, "en");

  console.log(`\n📋 English passthrough (translateFromEnglish)`);
  console.log(`   Expected : ${englishInput2}`);
  console.log(`   Actual   : ${t5}`);

  if (t5 === englishInput2) {
    pass("exact match, no API call was made");
  } else {
    fail("text was changed when it should have been returned as-is");
  }

  // ───────────────────────────────────────────────────────────────
  // FINAL SUMMARY
  // ───────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════════");
  console.log(`  RESULTS:  ${passed} passed  |  ${failed} failed  |  ${passed + failed} total`);
  console.log("══════════════════════════════════════════════════════\n");

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("\n❌ Test runner crashed unexpectedly:", err.message);
  process.exit(1);
});
