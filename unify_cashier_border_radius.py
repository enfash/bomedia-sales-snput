import os
import re

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Regex to find borderRadius: <value>
    # We will use a callback to determine replacement
    def replacer(match):
        val_str = match.group(1).strip()
        # Keep 50%
        if "50%" in val_str:
            return match.group(0)
        
        # Determine size
        # if it's a large value, use "16px", else use "10px"
        is_large = False
        if "rem" in val_str or "16px" in val_str or "24px" in val_str:
            is_large = True
        else:
            try:
                # check if it's a number
                num = float(val_str)
                if num >= 3:
                    is_large = True
            except:
                pass
        
        new_val = '"16px"' if is_large else '"10px"'
        return f"borderRadius: {new_val}"

    new_content = re.sub(r'borderRadius:\s*([^,}]+)', replacer, content)

    if new_content != content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"Updated {filepath}")

cashier_dir = "/Users/elijah/Documents/Dev/bomedia-sales-snput/app/cashier"
for root, _, files in os.walk(cashier_dir):
    for file in files:
        if file.endswith(".tsx"):
            process_file(os.path.join(root, file))

