import re

filepath = 'resources/js/Pages/Dashboard.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

def replacer(match, color, glowColor, totalVar, subtitle):
    return (
        f'<motion.div\n'
        f'                            variants={{cardItemVariants}}\n'
        f'                            whileHover={{{{ y: -4, transition: {{ type: \'spring\', stiffness: 350, damping: 25 }} }}}}\n'
        f'                            whileTap={{{{ scale: 0.99 }}}}\n'
        f'                        >\n'
        f'                            <HoverSpotlightCard glowColor="{glowColor}" className="{match.group(1)}">\n'
        f'                            <div className="flex items-start justify-between gap-2">\n'
        f'                                <div className="min-w-0">\n'
        f'                                    <div className="flex items-center gap-1.5">\n'
        f'                                        <BreathingBeacon color="{color}" />\n'
        f'                                        <span className="{match.group(2)}">\n'
        f'                                            {match.group(3)}\n'
        f'                                        </span>\n'
        f'                                    </div>\n'
        f'                                    <div className="{match.group(4)}">\n'
        f'                                        <Odometer value={{{totalVar}}} className="text-2xl sm:text-3xl md:text-4xl font-black font-mono text-slate-900 dark:text-white tracking-tight" />\n'
        f'                                        <span className="{match.group(5)}">{subtitle}</span>\n'
        f'                                    </div>\n'
        f'                                </div>\n'
        f'                                <div className="{match.group(6)}">\n'
        f'{match.group(7)}'
        f'                                </div>\n'
        f'                            </div>\n\n'
        f'                            <div className="{match.group(8)}">\n'
        f'{match.group(9)}'
        f'                            </div>\n'
        f'                            </HoverSpotlightCard>\n'
        f'                        </motion.div>'
    )

content = re.sub(
    r'<motion\.div\s+variants=\{cardItemVariants\}\s+whileHover=\{\{ y: -4, transition: \{ type: \'spring\', stiffness: 350, damping: 25 \} \}\}\s+whileTap=\{\{ scale: 0\.99 \}\}\s+className="([^"]+)"\s*>\s*<div className="flex items-start justify-between gap-2">\s*<div className="min-w-0">\s*<div className="flex items-center gap-1\.5">\s*<span className="h-1\.5 w-1\.5 rounded-full bg-amber-500"><\/span>\s*<span className="([^"]+)">\s*(Terlambat)\s*<\/span>\s*<\/div>\s*<div className="([^"]+)">\s*<span className="text-2xl sm:text-3xl md:text-4xl font-black font-mono text-slate-900 dark:text-white tracking-tight">\s*\{totalLate\}\s*<\/span>\s*<span className="([^"]+)">Guru<\/span>\s*<\/div>\s*<\/div>\s*<div className="([^"]+)">\s*(.*?)\s*<\/div>\s*<\/div>\s*<div className="([^"]+)">\s*(.*?)\s*<\/div>\s*<\/motion\.div>',
    lambda m: replacer(m, 'amber', 'rgba(245, 158, 11, 0.15)', 'totalLate', 'Guru'),
    content,
    flags=re.DOTALL
)

content = re.sub(
    r'<motion\.div\s+variants=\{cardItemVariants\}\s+whileHover=\{\{ y: -4, transition: \{ type: \'spring\', stiffness: 350, damping: 25 \} \}\}\s+whileTap=\{\{ scale: 0\.99 \}\}\s+className="([^"]+)"\s*>\s*<div className="flex items-start justify-between gap-2">\s*<div className="min-w-0">\s*<div className="flex items-center gap-1\.5">\s*<span className="h-1\.5 w-1\.5 rounded-full bg-purple-500"><\/span>\s*<span className="([^"]+)">\s*(Dispensasi)\s*<\/span>\s*<\/div>\s*<div className="([^"]+)">\s*<span className="text-2xl sm:text-3xl md:text-4xl font-black font-mono text-slate-900 dark:text-white tracking-tight">\s*\{totalDispensasi\}\s*<\/span>\s*<span className="([^"]+)">Guru<\/span>\s*<\/div>\s*<\/div>\s*<div className="([^"]+)">\s*(.*?)\s*<\/div>\s*<\/div>\s*<div className="([^"]+)">\s*(.*?)\s*<\/div>\s*<\/motion\.div>',
    lambda m: replacer(m, 'purple', 'rgba(168, 85, 247, 0.15)', 'totalDispensasi', 'Guru'),
    content,
    flags=re.DOTALL
)

content = re.sub(
    r'<motion\.div\s+variants=\{cardItemVariants\}\s+whileHover=\{\{ y: -4, transition: \{ type: \'spring\', stiffness: 350, damping: 25 \} \}\}\s+whileTap=\{\{ scale: 0\.99 \}\}\s+className="([^"]+)"\s*>\s*<div className="flex items-start justify-between gap-2">\s*<div className="min-w-0">\s*<div className="flex items-center gap-1\.5">\s*<span className="h-1\.5 w-1\.5 rounded-full bg-slate-400"><\/span>\s*<span className="([^"]+)">\s*(Belum Hadir)\s*<\/span>\s*<\/div>\s*<div className="([^"]+)">\s*<span className="text-2xl sm:text-3xl md:text-4xl font-black font-mono text-slate-900 dark:text-white tracking-tight">\s*\{totalAbsent\}\s*<\/span>\s*<span className="([^"]+)">Guru<\/span>\s*<\/div>\s*<\/div>\s*<div className="([^"]+)">\s*(.*?)\s*<\/div>\s*<\/div>\s*<div className="([^"]+)">\s*(.*?)\s*<\/div>\s*<\/motion\.div>',
    lambda m: replacer(m, 'neutral', 'rgba(148, 163, 184, 0.15)', 'totalAbsent', 'Guru'),
    content,
    flags=re.DOTALL
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print('Done!')
