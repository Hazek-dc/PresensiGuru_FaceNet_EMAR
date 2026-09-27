import re

filepath = 'resources/js/Pages/Dashboard.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add `isSopExpanded` state next to `isStudioExpanded`
content = content.replace(
    '''const [isStudioExpanded, setIsStudioExpanded] = useState<boolean>(false);''',
    '''const [isStudioExpanded, setIsStudioExpanded] = useState<boolean>(false);
    const [isSopExpanded, setIsSopExpanded] = useState<boolean>(false);'''
)

# 2. Update SOP Header to be clickable and wrap contents in AnimatePresence
sop_start = '''<div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-slate-200/70 dark:border-white/[0.08]">
                                <div className="flex items-center gap-2.5">'''

sop_new_header = '''<div 
                                onClick={() => setIsSopExpanded(prev => !prev)}
                                className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-slate-200/70 dark:border-white/[0.08] cursor-pointer hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors rounded-xl -mx-2 px-2"
                            >
                                <div className="flex items-center gap-2.5">'''

content = content.replace(sop_start, sop_new_header)

sop_header_end = '''<div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-white/[0.06] px-2.5 py-1 rounded-lg border border-slate-200/60 dark:border-white/10">
                                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                    <span>{currentTime || 'WIB'}</span>
                                </div>
                            </div>'''

sop_new_header_end = '''<div className="flex items-center gap-3">
                                    <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-white/[0.06] px-2.5 py-1 rounded-lg border border-slate-200/60 dark:border-white/10">
                                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                        <span>{currentTime || 'WIB'}</span>
                                    </div>
                                    <button className="flex items-center justify-center h-8 w-8 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 transition-colors">
                                        <span className="material-symbols-outlined text-[18px]">
                                            {isSopExpanded ? 'expand_less' : 'expand_more'}
                                        </span>
                                    </button>
                                </div>
                            </div>
                            
                            <AnimatePresence>
                                {isSopExpanded && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                                        className="overflow-hidden"
                                    >'''

content = content.replace(sop_header_end, sop_new_header_end)

sop_widget_end = '''                                        })}
                                </div>
                            </div>
                        </motion.div>'''

sop_new_widget_end = '''                                        })}
                                </div>
                            </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>'''

content = content.replace(sop_widget_end, sop_new_widget_end)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
