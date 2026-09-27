import re

filepath = 'resources/js/Pages/Dashboard.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace Buka Studio button with LiquidSheenButton
content = re.sub(
    r'<button\s+type="button"\s+onClick=\{handleLaunchStudio\}\s+className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1\.5 min-h-\[40px\] rounded-xl bg-gradient-to-r from-royal-blue to-indigo-600 dark:from-sky-500 dark:to-royal-blue px-3\.5 py-2 text-xs font-bold text-white shadow-xs hover:brightness-105 active:scale-95 transition-all"\s*>\s*<span className="material-symbols-outlined text-\[16px\]">play_arrow<\/span>\s*<span>Buka Studio<\/span>\s*<\/button>',
    r'''<LiquidSheenButton
                                type="button"
                                onClick={handleLaunchStudio}
                                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 min-h-[40px] rounded-xl bg-gradient-to-r from-royal-blue to-indigo-600 dark:from-sky-500 dark:to-royal-blue px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:brightness-105 active:scale-95 transition-all"
                            >
                                <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                                <span>Buka Studio</span>
                            </LiquidSheenButton>''',
    content,
    flags=re.DOTALL
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
