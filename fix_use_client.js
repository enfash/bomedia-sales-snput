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
    
    // Check if the file contains the use client directive
    if (content.includes('"use client"') || content.includes("'use client'")) {
      // Remove any existing use client directives
      content = content.replace(/"use client";?\n?/g, '');
      content = content.replace(/'use client';?\n?/g, '');
      
      // Prepend "use client"; at the very top
      content = '"use client";\n' + content.trimStart();
      
      fs.writeFileSync(f, content);
      console.log('Fixed use client in', f);
    }
  }
});
