const fs = require('fs');

const files = [
  'app/bom03/page.tsx',
  'app/cashier/page.tsx',
  'app/bom03/inventory/page.tsx',
  'app/bom03/staff/page.tsx',
  'app/cashier/inventory/page.tsx'
];

files.forEach(f => {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, 'utf8');
    if (content.includes('<LoadingAnimation') && !content.includes('import { LoadingAnimation }')) {
      content = 'import { LoadingAnimation } from "@/components/loading-animation";\n' + content;
      fs.writeFileSync(f, content);
      console.log('Added import to', f);
    }
  }
});
