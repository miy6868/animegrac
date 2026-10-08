// Prints the parameter reference table (markdown) from PARAM_SCHEMA + DEFAULT_PARAMS.
// Used to keep STYLE.md in sync:  node scripts/gen-param-table.mjs
import { PARAM_SCHEMA, DEFAULT_PARAMS } from '../src/anime-style/presets.js';

const get = (path) => path.split('.').reduce((o, k) => o?.[k], DEFAULT_PARAMS);
let section = '';
const lines = [];
for (const [path, spec] of Object.entries(PARAM_SCHEMA)) {
  const s = path.split('.')[0];
  if (s !== section) {
    section = s;
    lines.push('', `**${s}**`, '', '| 키 | 기본값 | 범위 | 의미 |', '|---|---|---|---|');
  }
  const def = JSON.stringify(get(path));
  const range = typeof spec[0] === 'number' ? `${spec[0]} ~ ${spec[1]}` : spec[0].replace('|', ' 또는 ');
  lines.push(`| \`${path}\` | \`${def}\` | ${range} | ${spec[spec.length - 1]} |`);
}
console.log(lines.join('\n'));
