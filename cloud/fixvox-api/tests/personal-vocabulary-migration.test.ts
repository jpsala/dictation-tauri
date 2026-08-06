import { expect, test } from "bun:test";

test("personal vocabulary migration is account-scoped and provider-free", async () => {
  const sql = await Bun.file(new URL("../migrations/0008_personal_vocabulary.sql", import.meta.url)).text();
  expect(sql).toContain("CREATE TABLE personal_vocabulary_revisions");
  expect(sql).toContain("CREATE TABLE personal_vocabulary_rules");
  expect(sql).toContain("REFERENCES accounts(id) ON DELETE CASCADE");
  expect(sql).toContain("mode IN ('automatic', 'ask')");
  expect(sql).not.toMatch(/\b(provider|prompt|transcript|audio)_[a-z_]+\b/i);
});
