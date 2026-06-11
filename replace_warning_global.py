import os
import re

cashier_dir = "/Users/elijah/Documents/Dev/bomedia-sales-snput/app/cashier"

replacements = {
    '"warning.main"': '"primary.main"',
    '"warning.light"': '"primary.light"',
    '"warning.dark"': '"primary.dark"',
    '"warning.contrastText"': '"primary.contrastText"',
    'color="warning"': 'color="primary"',
    'palette.warning.': 'palette.primary.',
    '--mui-palette-warning-main': '--mui-palette-primary-main'
}

for root, dirs, files in os.walk(cashier_dir):
    for file in files:
        if file.endswith(".tsx"):
            filepath = os.path.join(root, file)
            with open(filepath, "r") as f:
                content = f.read()
            
            new_content = content
            for old_str, new_str in replacements.items():
                new_content = new_content.replace(old_str, new_str)
                
            if new_content != content:
                with open(filepath, "w") as f:
                    f.write(new_content)
                print(f"Updated {filepath}")
