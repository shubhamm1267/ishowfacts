import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const target = resolve('scripts', 'paper_doc.py');

const replacements = [
  {
    old: 'self.plan = json.loads(self.path.read_text())',
    updated: 'self.plan = json.loads(self.path.read_text(encoding="utf-8"))'
  },
  {
    old: 'words = json.loads(Path(path).read_text())',
    updated: 'words = json.loads(Path(path).read_text(encoding="utf-8"))'
  },
  {
    old: 'path.write_text(json.dumps(plan, indent=1))',
    updated: 'path.write_text(json.dumps(plan, indent=1, ensure_ascii=False), encoding="utf-8")'
  }
];

async function main() {
  let code = await readFile(target, 'utf8');
  let changed = 0;

  for (const item of replacements) {
    if (code.includes(item.updated)) {
      console.log('Already fixed:', item.old);
      continue;
    }

    if (!code.includes(item.old)) {
      throw new Error('Expected code not found: ' + item.old);
    }

    code = code.replace(item.old, item.updated);
    changed++;
  }

  if (changed > 0) {
    await writeFile(target, code, 'utf8');
  }

  console.log('Done. Changes applied:', changed);
}

main().catch(error => {
  console.error('Fix failed:', error.message);
  process.exitCode = 1;
});