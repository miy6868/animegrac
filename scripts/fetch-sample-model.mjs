// Downloads a free sample avatar for examples/model.html into public/models/.
// Model: "VRM1_Constraint_Twist_Sample" by pixiv Inc. (VRM Public License 1.0:
// avatar use by everyone, commercial use, modification and redistribution allowed,
// credit not required). Not committed to the repo to keep it small.
import { mkdir, writeFile, access } from 'node:fs/promises';

const URL_ = 'https://raw.githubusercontent.com/pixiv/three-vrm/dev/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm';
const OUT = new URL('../public/models/sample.vrm', import.meta.url);

try {
  await access(OUT);
  console.log('already there:', OUT.pathname);
} catch {
  await mkdir(new URL('../public/models/', import.meta.url), { recursive: true });
  const res = await fetch(URL_);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  await writeFile(OUT, Buffer.from(await res.arrayBuffer()));
  console.log('saved', OUT.pathname);
}
