import fs from "node:fs";
import path from "node:path";

describe("profile preferences", () => {
  it("does not expose language or timezone controls", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/features/product/profile-page.tsx"), "utf8");

    expect(source).not.toContain("<span>Ngôn ngữ</span>");
    expect(source).not.toContain("<span>Múi giờ</span>");
    expect(source).not.toMatch(/updateProfile\([^)]*language/);
    expect(source).not.toMatch(/updateProfile\([^)]*timezone/);
  });
});
