const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const gameCss = readFileSync(
  path.join(__dirname, "../public/style.css"),
  "utf8"
);

function ruleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  return match ? match[1] : null;
}

test("collapsed slap rules shrink at every viewport size", () => {
  const collapsed = ruleBody(
    gameCss,
    ".egyptian-war-slap-rules.is-collapsed"
  );
  assert.match(collapsed ?? "", /width:\s*auto/);
});

test("the game stylesheet does not own GameHub's connection indicator", () => {
  assert.equal(gameCss.includes(".server-connection-status"), false);
});
