import sys

filepath = 'resources/js/Pages/Dashboard.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip_next = False
for i, line in enumerate(lines):
    if skip_next:
        skip_next = False
        continue
    
    if 'Sebelum 07.15</span>' in line:
        new_lines.append(line)
        new_lines.append(lines[i+1])
        new_lines.append('                            </HoverSpotlightCard>\n')
        skip_next = True
        continue
        
    if '</HoverSpotlightCard>' in line and i > 900 and i < 970:
        continue
        
    new_lines.append(line)

with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
print('Done!')
