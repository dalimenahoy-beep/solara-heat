// SOLARA HEAT — the entry program for make.fun's gta6-01 bounty (Node 22, stdlib only).
//
// The game is the static site in game/ beside this file: an original open-world crime game
// (three.js vendored under game/vendor/) that a desktop browser plays fully offline. This
// program only hands it in: it copies game/ and screenshots/ into the output directory and
// writes dossier.json there using the kit's buildDossier library, passing the same caps
// the scorer enforces, so the dossier I test locally is the one that gets graded.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outputDir, 'game'), { recursive: true });

const shotsDir = join(repoDir, 'screenshots');
if (existsSync(shotsDir)) {
  mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
  cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });
}

// The gate's caps, mirrored from the competition's reference/gate.json: dossier text at
// most 160 KiB, at most 4 screenshots of at most 256 KiB each, game/ at most 993 entries
// and 48 MiB in all, and no path under game/ longer than 1,000 UTF-8 bytes.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
