import os

filepath = "/Users/elijah/Documents/Dev/bomedia-sales-snput/app/cashier/records/page.tsx"

with open(filepath, "r") as f:
    content = f.read()

# Replace all warning color tokens with primary
new_content = content.replace('"warning.main"', '"primary.main"')
new_content = new_content.replace('"warning.dark"', '"primary.dark"')
new_content = new_content.replace('"warning.light"', '"primary.light"')
new_content = new_content.replace('"warning.contrastText"', '"primary.contrastText"')

if new_content != content:
    with open(filepath, "w") as f:
        f.write(new_content)
    print("Updated " + filepath)
else:
    print("No changes needed in " + filepath)
