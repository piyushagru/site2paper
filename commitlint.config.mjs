/**
 * Commit-message gate (husky commit-msg hook + CI).
 * AGENTS.md is the source of truth for commit style; this enforces the
 * machine-checkable part. Aim for ~50-char subjects; 72 is the hard cap.
 */
const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "header-max-length": [2, "always", 72],
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "docs", "style", "refactor", "perf", "test", "chore", "ci"],
    ],
  },
};

export default config;
