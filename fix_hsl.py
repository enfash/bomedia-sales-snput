import os
import re

def fix_file(filepath):
    if not os.path.exists(filepath):
        print(f"Skipping {filepath}, does not exist.")
        return
        
    with open(filepath, 'r') as f:
        content = f.read()

    # Replace hsl(var(--something)) with var(--something)
    new_content = re.sub(r'hsl\((var\(--[a-zA-Z0-9_-]+\))\)', r'\1', content)
    
    # Also replace any hardcoded hsl(...) with itself? No, hardcoded hsl is fine, 
    # but the ones with var(--...) are the issue.
    
    # Wait, in the legend arrays we have:
    # "hsl(142 71% 45%)"
    # Those don't have var(), so they won't be replaced by the regex above.
    
    with open(filepath, 'w') as f:
        f.write(new_content)
    
    print(f"Fixed {filepath}")

fix_file("components/dashboard-charts.tsx")
fix_file("components/dashboard-metrics.tsx")
fix_file("components/recent-payments-pulse.tsx")
fix_file("components/profitability-widget.tsx")
