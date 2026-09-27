import re

filepath = 'resources/js/Pages/Dashboard.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace filteredHistory animation
content = re.sub(
    r'initial=\{\{ opacity: 0, y: 10 \}\}\s*animate=\{\{ opacity: 1, y: 0 \}\}\s*exit=\{\{ opacity: 0, scale: 0\.96 \}\}\s*transition=\{\{ duration: 0\.2, delay: Math\.min\(idx \* 0\.02, 0\.25\) \}\}\s*className="group relative shrink-0 rounded-2xl',
    r'''initial={{ opacity: 0, y: -10, boxShadow: isPresent || isPulang ? '0px 0px 25px 4px rgba(16,185,129,0.2)' : (isLate ? '0px 0px 25px 4px rgba(245,158,11,0.2)' : '0px 0px 25px 4px rgba(244,63,94,0.2)') }}
                                                    animate={{ opacity: 1, y: 0, boxShadow: '0px 0px 0px 0px rgba(0,0,0,0)' }}
                                                    exit={{ opacity: 0, scale: 0.96 }}
                                                    transition={{
                                                        opacity: { duration: 0.3, delay: Math.min(idx * 0.04, 0.3) },
                                                        y: { type: 'spring', stiffness: 350, damping: 25, delay: Math.min(idx * 0.04, 0.3) },
                                                        boxShadow: { duration: 1.2, ease: "easeOut", delay: Math.min(idx * 0.04, 0.3) }
                                                    }}
                                                    className="group relative shrink-0 rounded-2xl''',
    content
)

# Replace filteredActivities animation
content = re.sub(
    r'initial=\{\{ opacity: 0, y: 10 \}\}\s*animate=\{\{ opacity: 1, y: 0 \}\}\s*exit=\{\{ opacity: 0, scale: 0\.96 \}\}\s*transition=\{\{ duration: 0\.2, delay: Math\.min\(idx \* 0\.02, 0\.25\) \}\}\s*className="group relative shrink-0 flex flex-col',
    r'''initial={{ opacity: 0, y: -10, boxShadow: isAttendance ? '0px 0px 25px 4px rgba(16,185,129,0.2)' : (isEnrollment ? '0px 0px 25px 4px rgba(168,85,247,0.2)' : '0px 0px 25px 4px rgba(148,163,184,0.2)') }}
                                                    animate={{ opacity: 1, y: 0, boxShadow: '0px 0px 0px 0px rgba(0,0,0,0)' }}
                                                    exit={{ opacity: 0, scale: 0.96 }}
                                                    transition={{
                                                        opacity: { duration: 0.3, delay: Math.min(idx * 0.04, 0.3) },
                                                        y: { type: 'spring', stiffness: 350, damping: 25, delay: Math.min(idx * 0.04, 0.3) },
                                                        boxShadow: { duration: 1.2, ease: "easeOut", delay: Math.min(idx * 0.04, 0.3) }
                                                    }}
                                                    className="group relative shrink-0 flex flex-col''',
    content
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
