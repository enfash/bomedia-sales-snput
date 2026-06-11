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
  
  // Find all instances of `<Box sx={{...}}>` that we might have messed up
  // Actually, we can just find `p: { xs: 3, md: 4 }, pb: { xs: 14, md: 4 }, ` or similar 
  // and remove the SECOND `p: ` and `pb: `.
  
  const defaultExportMatch = content.indexOf("export default function");
  if (defaultExportMatch === -1) continue;
  
  const afterExport = content.slice(defaultExportMatch);
  const regex = /(return\s*\(\s*<Box\s+sx=\{\{)([\s\S]*?)(?=\}\}\s*>)/;
  const match = afterExport.match(regex);
  if (match) {
    let sxContent = match[2];
    
    // Split the sx content by top-level commas to parse the properties
    let props = [];
    let currentProp = "";
    let depth = 0;
    
    for (let i = 0; i < sxContent.length; i++) {
      const char = sxContent[i];
      if (char === '{') depth++;
      else if (char === '}') depth--;
      
      if (char === ',' && depth === 0) {
        props.push(currentProp.trim());
        currentProp = "";
      } else {
        currentProp += char;
      }
    }
    if (currentProp.trim()) props.push(currentProp.trim());
    
    // Now filter out properties
    let newProps = [];
    let seenP = false;
    let seenPb = false;
    let seenPt = false;
    let seenPx = false;
    let seenPy = false;
    
    // We already prepended `p: { xs: 3, md: 4 }, pb: { xs: 14, md: 4 }`
    // So the FIRST ones are the ones we want to keep, and the REST we want to drop!
    for (let p of props) {
      if (p.startsWith('p:')) {
        if (!seenP) { seenP = true; newProps.push(p); }
      } else if (p.startsWith('pb:')) {
        if (!seenPb) { seenPb = true; newProps.push(p); }
      } else if (p.startsWith('pt:')) {
        if (!seenPt) { seenPt = true; newProps.push(p); }
      } else if (p.startsWith('px:')) {
        if (!seenPx) { seenPx = true; newProps.push(p); }
      } else if (p.startsWith('py:')) {
        if (!seenPy) { seenPy = true; newProps.push(p); }
      } else {
        newProps.push(p);
      }
    }
    
    const newSx = match[1] + newProps.join(', ');
    const index = defaultExportMatch + match.index;
    const newContent = content.substring(0, index) + newSx + content.substring(index + match[0].length);
    fs.writeFileSync(file, newContent);
    console.log("Fixed padding for", file);
  }
}
