const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else if (file.endsWith("page.tsx")) {
      results.push(file);
    }
  });
  return results;
}

const files = walk("./app");
for (const file of files) {
  if (file === "app/page.tsx" || file.includes("login") || file === "app/quick-check/page.tsx") continue;
  
  let content = fs.readFileSync(file, 'utf8');
  const defaultExportMatch = content.indexOf("export default function");
  if (defaultExportMatch === -1) continue;
  
  const afterExport = content.slice(defaultExportMatch);
  
  // Find the first <Box sx={{ ... }}> 
  const regex = /(return\s*\(\s*<Box\s+sx=\{\{)([\s\S]*?)(?=\}\}\s*>)/;
  const match = afterExport.match(regex);
  if (match) {
    let sxContent = match[2];
    
    // Carefully remove p, pt, pb, px, py
    // Using a regex that handles nested {} like { xs: 2, md: 4 } or flat values like 4
    const removeProp = (prop) => {
      const propRegex = new RegExp(`(^|\\s*,\\s*)${prop}\\s*:\\s*(\\{[^}]+\\}|[^,}]+)(\\s*,)?`, 'g');
      sxContent = sxContent.replace(propRegex, (m, p1, p2, p3) => {
        // If it was preceded by a comma and followed by a comma, leave one comma
        if (p1.includes(',') && p3 && p3.includes(',')) return ', ';
        // If it was the first item and followed by a comma
        if (!p1.includes(',') && p3 && p3.includes(',')) return '';
        return '';
      });
    };
    
    removeProp('p');
    removeProp('pt');
    removeProp('pb');
    removeProp('px');
    removeProp('py');
    
    sxContent = sxContent.trim();
    if (sxContent.startsWith(',')) sxContent = sxContent.slice(1).trim();
    if (sxContent.endsWith(',')) sxContent = sxContent.slice(0, -1).trim();
    
    let newPadding = 'p: { xs: 3, md: 4 }, pb: { xs: 14, md: 4 }';
    
    if (file.includes("new-entry") || file.includes("estimator")) {
      newPadding = 'p: { xs: 3, md: 4 }, pb: { xs: 12, md: 4 }'; // slightly less pb since no BottomNav, but enough for scroll clearance
    }
    
    const newSx = match[1] + newPadding + (sxContent ? ', ' + sxContent : '');
    
    const index = defaultExportMatch + match.index;
    const newContent = content.substring(0, index) + newSx + content.substring(index + match[0].length);
    fs.writeFileSync(file, newContent);
    console.log("Updated padding for", file);
  }
}
