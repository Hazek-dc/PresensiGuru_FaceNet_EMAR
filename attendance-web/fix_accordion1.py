import re

filepath = 'resources/js/Pages/Dashboard.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Update Testing Scenario transition
content = content.replace(
    '''transition={{ duration: 0.25, ease: 'easeInOut' }}''',
    '''transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}'''
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
