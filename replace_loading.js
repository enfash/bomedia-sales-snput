const fs = require('fs');

const files = [
  'app/bom03/page.tsx',
  'app/cashier/page.tsx',
  'app/bom03/expenses/page.tsx',
  'app/bom03/inventory/page.tsx',
  'app/bom03/staff/page.tsx',
  'app/bom03/records/page.tsx',
  'app/cashier/inventory/page.tsx',
  'app/cashier/records/page.tsx',
  'app/cashier/estimator/page.tsx'
];

files.forEach(file => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');
  
  const regex = /if\s*\((loading|loadingCashiers)\)\s*\{\s*return\s*\([\s\S]*?\);\s*\}/g;
  
  if (regex.test(content)) {
    content = content.replace(regex, (match, varName) => {
      return `if (${varName}) {
    return (
      <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingAnimation text="Loading..." />
      </Box>
    );
  }`;
    });

    if (!content.includes('LoadingAnimation')) {
      content = content.replace(/import Box from "@mui\/material\/Box";/g, 'import { LoadingAnimation } from "@/components/loading-animation";\nimport Box from "@mui/material/Box";');
    }
    
    fs.writeFileSync(file, content);
    console.log('Updated', file);
  }
});
