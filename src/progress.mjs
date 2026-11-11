// Terminal status: one live line with a spinner on a TTY, plain lines everywhere else (CI, pipes, files).
// No dependency on purpose: the runtime deps are fixed at three (AGENTS.md).

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function formatDuration(ms) {
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

export function bar(done, total, width = 16) {
  const n = total > 0 ? Math.round((Math.min(done, total) / total) * width) : 0;
  return "█".repeat(n) + "░".repeat(width - n);
}

/** Time left from the average so far; null until one item is done. */
export function eta(done, total, elapsedMs) {
  return done > 0 && total > done ? (elapsedMs / done) * (total - done) : null;
}

export function fit(text, cols) {
  return !cols || text.length <= cols ? text : `${text.slice(0, Math.max(0, cols - 1))}…`;
}

export function createProgress({ stream = process.stderr, env = process.env, quiet = false } = {}) {
  const live = Boolean(stream.isTTY) && env.TERM !== "dumb" && !env.CI;
  const color = live && !env.NO_COLOR;
  const paint = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
  let label = "";
  let detail = "";
  let started = Date.now();
  let frame = 0;
  let timer = null;
  let drawn = 0;
  const write = (s) => { if (!quiet) stream.write(s); };
  const clear = () => {
    if (!drawn) return;
    write(`\r${drawn > 1 ? `\x1b[${drawn - 1}A` : ""}\x1b[J`);
    drawn = 0;
  };
  const render = () => {
    if (!label) return;
    clear();
    const cols = stream.columns || 80;
    const head = fit(`${FRAMES[frame++ % FRAMES.length]} ${label}  ${formatDuration(Date.now() - started)}`, cols);
    const sub = detail ? fit(`  ${detail}`, cols) : "";
    write(paint("36", head[0]) + head.slice(1) + (sub ? `\n${paint("2", sub)}` : ""));
    drawn = sub ? 2 : 1;
  };
  // Permanent lines are written above the live block, which is redrawn under them.
  const line = (text) => { clear(); write(`${text}\n`); if (live) render(); };
  const end = () => { clearInterval(timer); timer = null; clear(); const ms = Date.now() - started; label = ""; detail = ""; return ms; };
  return {
    live,
    start(text) {
      end();
      label = text;
      started = Date.now();
      if (live) { timer = setInterval(render, 80); timer.unref?.(); render(); } else write(`  ${text}\n`);
    },
    label(text) { label = text; },
    item(text) { if (live) { detail = text; render(); } else write(`    ${text}\n`); },
    log: line,
    fail(text) { line(`${paint("31", "✗")} ${text}`); },
    done(text) { const ms = end(); write(`${paint("32", "✓")} ${text}  ${paint("2", formatDuration(ms))}\n`); },
    stop: end,
  };
}
