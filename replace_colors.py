import os

cashier_dir = "/Users/elijah/Documents/Dev/bomedia-sales-snput/app/cashier"

replacements = {
    "rgba(232,161,58": "rgba(247,104,8",
    "rgba(232, 161, 58": "rgba(247, 104, 8",
    "rgba(200,71,46": "rgba(247,104,8",
    "rgba(200, 71, 46": "rgba(247, 104, 8",
    "#E8A13A": "#F76808",
    "#e8a13a": "#f76808",
    "#C8472E": "#F76808",
    "#c8472e": "#f76808",
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

