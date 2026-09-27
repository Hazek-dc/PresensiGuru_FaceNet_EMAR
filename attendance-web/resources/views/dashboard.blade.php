<!-- ISO Metrics Dashboard - Blue Horizon -->
<!DOCTYPE html>

<html class="light" lang="en"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>ISO/IEC 30107-3 Metrics Dashboard for Researchers</title>
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&amp;family=Inter:wght@400;500;600;700&amp;family=JetBrains+Mono:wght@400;500;600&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<script id="tailwind-config">
        tailwind.config = {
            darkMode: "class",
            theme: {
                extend: {
                    "colors": {
                        "tertiary-container": "#454c59",
                        "on-secondary-fixed-variant": "#414274",
                        "background": "#f9f9ff",
                        "primary-container": "#0000ff",
                        "on-surface-variant": "#454558",
                        "on-background": "#111c2d",
                        "on-primary-fixed": "#00006e",
                        "on-secondary": "#ffffff",
                        "on-secondary-fixed": "#151546",
                        "on-tertiary-container": "#b5bccc",
                        "tertiary-fixed-dim": "#bfc7d6",
                        "surface-container-highest": "#d8e3fb",
                        "on-primary-container": "#b3b7ff",
                        "error": "#ba1a1a",
                        "on-tertiary": "#ffffff",
                        "on-primary-fixed-variant": "#0000ef",
                        "surface": "#f9f9ff",
                        "primary": "#0001bb",
                        "on-error-container": "#93000a",
                        "secondary": "#59598d",
                        "on-primary": "#ffffff",
                        "inverse-surface": "#263143",
                        "on-secondary-container": "#4f4f83",
                        "outline-variant": "#c5c4db",
                        "outline": "#757589",
                        "surface-container": "#e7eeff",
                        "error-container": "#ffdad6",
                        "primary-fixed-dim": "#bec2ff",
                        "primary-fixed": "#e0e0ff",
                        "secondary-fixed": "#e2dfff",
                        "surface-container-low": "#f0f3ff",
                        "surface-dim": "#cfdaf2",
                        "surface-container-high": "#dee8ff",
                        "surface-container-lowest": "#ffffff",
                        "secondary-container": "#c4c4ff",
                        "surface-tint": "#343dff",
                        "surface-bright": "#f9f9ff",
                        "tertiary": "#2e3541",
                        "tertiary-fixed": "#dce3f2",
                        "on-tertiary-fixed-variant": "#404754",
                        "inverse-primary": "#bec2ff",
                        "on-error": "#ffffff",
                        "secondary-fixed-dim": "#c2c1fc",
                        "on-tertiary-fixed": "#151c27",
                        "surface-variant": "#d8e3fb",
                        "on-surface": "#111c2d",
                        "inverse-on-surface": "#ecf1ff"
                    },
                    "borderRadius": {
                        "DEFAULT": "0.125rem",
                        "lg": "0.25rem",
                        "xl": "0.5rem",
                        "full": "0.75rem"
                    },
                    "spacing": {
                        "unit": "4px",
                        "container-max-width": "1440px",
                        "margin-mobile": "16px",
                        "gutter-mobile": "16px",
                        "margin-desktop": "40px",
                        "gutter-desktop": "24px",
                        "card-padding": "20px",
                        "container-margin": "24px",
                        "stack-md": "16px",
                        "stack-sm": "8px",
                        "gutter": "16px",
                        "stack-lg": "24px"
                    },
                    "fontFamily": {
                        "headline-lg-mobile": ["Hanken Grotesk"],
                        "label-md": ["JetBrains Mono"],
                        "display-xl": ["Hanken Grotesk"],
                        "label-sm": ["JetBrains Mono"],
                        "headline-md": ["Hanken Grotesk"],
                        "headline-lg": ["Hanken Grotesk"],
                        "headline-sm": ["Hanken Grotesk"],
                        "body-sm": ["Inter"],
                        "body-lg": ["Inter"],
                        "body-md": ["Inter"],
                        "mono-metrics": ["JetBrains Mono"]
                    },
                    "fontSize": {
                        "headline-lg-mobile": ["24px", { "lineHeight": "32px", "fontWeight": "600" }],
                        "label-md": ["13px", { "lineHeight": "16px", "letterSpacing": "0.05em", "fontWeight": "500" }],
                        "display-xl": ["48px", { "lineHeight": "56px", "letterSpacing": "-0.02em", "fontWeight": "700" }],
                        "label-sm": ["11px", { "lineHeight": "14px", "letterSpacing": "0.03em", "fontWeight": "500" }],
                        "headline-md": ["24px", { "lineHeight": "32px", "fontWeight": "600" }],
                        "headline-sm": ["18px", { "lineHeight": "26px", "fontWeight": "600" }],
                        "headline-lg": ["32px", { "lineHeight": "40px", "fontWeight": "600" }],
                        "body-sm": ["14px", { "lineHeight": "20px", "fontWeight": "400" }],
                        "body-lg": ["18px", { "lineHeight": "28px", "fontWeight": "400" }],
                        "body-md": ["16px", { "lineHeight": "24px", "fontWeight": "400" }],
                        "mono-metrics": ["13px", { "lineHeight": "18px", "letterSpacing": "-0.01em", "fontWeight": "500" }]
                    }
                }
            }
        }
    </script>
<style>
        .chart-bar { transition: height 0.3s ease; }
        .data-point { transition: all 0.2s ease; }
        .data-point:hover { transform: scale(1.5); }
    </style>
</head>
<body class="bg-background text-on-background font-body-md min-h-screen flex">
<!-- SideNavBar -->
<nav class="fixed left-0 top-0 h-full w-[260px] bg-surface-container-highest border-r border-outline-variant flex flex-col py-stack-lg z-20">
<div class="px-container-margin mb-stack-lg">
<div class="flex items-center gap-stack-sm mb-stack-sm">
<img alt="User Profile Avatar" class="w-10 h-10 rounded-full bg-surface-variant object-cover" data-alt="A small, professional circular avatar showing a generic researcher profile icon in a minimalist corporate style." src="https://lh3.googleusercontent.com/aida-public/AB6AXuAUOIE0mciybaij_eSB4gQFuRuTFH9s3FrKWlXbfMRsiOjk5MZv7rY_8xn2U05DjNzPLbM4V9Q6WQxRZjDAi51skitp8SoqGWB_FBlCV_MESOcfsG-Zs1mRc_ajK8By4S9Tm8gbETTR7dYTGyoIDrA-1b5RotabaEU3UiILBHosBMedf8WFIexuOKzCkXv3zBGFbxO6vsfJ2jwAqInRiZWo678Nu98PpC0W7OIQYJh-aZcy8Rq2eGMALVbLP_OPU205bW3A5QACn10"/>
<div>
<h2 class="font-headline-md text-headline-md font-bold text-primary">Biometric Admin</h2>
<p class="font-body-sm text-body-sm text-on-surface-variant">Researcher Role</p>
</div>
</div>
</div>
<div class="flex-1 overflow-y-auto">
<!-- Active Tab: Dashboard -->
<a class="flex items-center gap-stack-md px-card-padding py-stack-md text-primary border-l-4 border-primary bg-primary-container/10" href="#">
<span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">dashboard</span>
<span class="font-body-md text-body-md font-medium">Dashboard</span>
</a>
<a class="flex items-center gap-stack-md px-card-padding py-stack-md text-secondary hover:bg-surface-container-high transition-colors active:scale-[0.98]" href="#">
<span class="material-symbols-outlined">how_to_reg</span>
<span class="font-body-md text-body-md">Attendance</span>
</a>
<a class="flex items-center gap-stack-md px-card-padding py-stack-md text-secondary hover:bg-surface-container-high transition-colors active:scale-[0.98]" href="#">
<span class="material-symbols-outlined">group</span>
<span class="font-body-md text-body-md">Subjects/Enrollment</span>
</a>
<a class="flex items-center gap-stack-md px-card-padding py-stack-md text-secondary hover:bg-surface-container-high transition-colors active:scale-[0.98]" href="#">
<span class="material-symbols-outlined">phonelink_setup</span>
<span class="font-body-md text-body-md">Live Verification</span>
</a>
<a class="flex items-center gap-stack-md px-card-padding py-stack-md text-secondary hover:bg-surface-container-high transition-colors active:scale-[0.98]" href="#">
<span class="material-symbols-outlined">science</span>
<span class="font-body-md text-body-md">Research Module</span>
</a>
<a class="flex items-center gap-stack-md px-card-padding py-stack-md text-secondary hover:bg-surface-container-high transition-colors active:scale-[0.98]" href="#">
<span class="material-symbols-outlined">settings</span>
<span class="font-body-md text-body-md">System Settings</span>
</a>
</div>
<div class="mt-auto pt-stack-md border-t border-outline-variant px-container-margin">
<div class="flex items-center gap-2 mb-stack-md">
<span class="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
<span class="font-label-md text-label-md text-primary">Biometric-API: Online</span>
</div>
<a class="flex items-center gap-stack-md py-stack-sm text-secondary hover:bg-surface-container-high transition-colors rounded" href="#">
<span class="material-symbols-outlined">help</span>
<span class="font-body-md text-body-md">Help</span>
</a>
<a class="flex items-center gap-stack-md py-stack-sm text-secondary hover:bg-surface-container-high transition-colors rounded" href="#">
<span class="material-symbols-outlined">logout</span>
<span class="font-body-md text-body-md">Logout</span>
</a>
</div>
</nav>
<!-- TopNavBar -->
<header class="fixed top-0 right-0 w-[calc(100%-260px)] h-16 bg-surface border-b border-outline-variant shadow-sm z-10">
<div class="flex justify-between items-center px-container-margin h-full">
<div class="flex items-center gap-stack-lg">
<h1 class="font-headline-sm text-headline-sm font-bold text-on-surface">Biometric Research Platform</h1>
<div class="relative hidden lg:block">
<span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
<input class="pl-10 pr-4 py-2 border border-outline-variant rounded bg-surface-container-lowest text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none" placeholder="Search metrics..." type="text"/>
</div>
</div>
<div class="flex items-center gap-stack-lg h-full">
<nav class="flex h-full">
<!-- Active active_navigation styling applied below for Reports, others inactive -->
<a class="flex items-center h-full px-4 text-primary border-b-2 border-primary font-bold font-label-md text-label-md" href="#">Reports</a>
<a class="flex items-center h-full px-4 text-on-surface-variant hover:text-primary transition-colors font-label-md text-label-md" href="#">Logs</a>
<a class="flex items-center h-full px-4 text-on-surface-variant hover:text-primary transition-colors font-label-md text-label-md" href="#">Audit</a>
</nav>
<div class="flex items-center gap-stack-sm text-on-surface-variant">
<button class="p-2 hover:bg-surface-container-high rounded transition-colors"><span class="material-symbols-outlined">notifications</span></button>
<button class="p-2 hover:bg-surface-container-high rounded transition-colors"><span class="material-symbols-outlined">settings</span></button>
</div>
</div>
</div>
</header>
<!-- Main Content Area -->
<main class="ml-[260px] mt-16 p-container-margin w-full min-h-[calc(100vh-64px)] overflow-x-hidden">
<div class="mb-stack-lg">
<h1 class="font-headline-lg text-headline-lg text-on-surface">ISO/IEC 30107-3 Performance Metrics</h1>
<p class="font-body-md text-body-md text-on-surface-variant mt-unit">Presentation Attack Detection (PAD) Evaluation Results</p>
</div>
<div class="flex flex-col xl:flex-row gap-gutter">
<!-- Main Canvas -->
<div class="flex-1 flex flex-col gap-gutter">
<!-- Top Row: Metrics -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter">
<!-- APCER Max -->
<div class="bg-surface-container-lowest p-card-padding rounded-lg border border-outline-variant shadow-sm hover:shadow-md transition-shadow">
<div class="flex justify-between items-start mb-stack-sm">
<h3 class="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">APCER Max</h3>
<span class="material-symbols-outlined text-error">trending_up</span>
</div>
<div class="font-headline-lg text-headline-lg text-on-surface">2.4%</div>
<div class="mt-stack-sm h-8 flex items-end gap-1">
<div class="w-full bg-error/20 rounded-t h-2"></div>
<div class="w-full bg-error/40 rounded-t h-4"></div>
<div class="w-full bg-error/60 rounded-t h-3"></div>
<div class="w-full bg-error/80 rounded-t h-6"></div>
<div class="w-full bg-error rounded-t h-8"></div>
</div>
</div>
<!-- BPCER -->
<div class="bg-surface-container-lowest p-card-padding rounded-lg border border-outline-variant shadow-sm hover:shadow-md transition-shadow">
<div class="flex justify-between items-start mb-stack-sm">
<h3 class="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">BPCER</h3>
<span class="material-symbols-outlined text-secondary">trending_down</span>
</div>
<div class="font-headline-lg text-headline-lg text-on-surface">0.8%</div>
<div class="mt-stack-sm h-8 flex items-end gap-1">
<div class="w-full bg-secondary rounded-t h-6"></div>
<div class="w-full bg-secondary/80 rounded-t h-5"></div>
<div class="w-full bg-secondary/60 rounded-t h-4"></div>
<div class="w-full bg-secondary/40 rounded-t h-3"></div>
<div class="w-full bg-secondary/20 rounded-t h-2"></div>
</div>
</div>
<!-- ACER -->
<div class="bg-surface-container-lowest p-card-padding rounded-lg border border-outline-variant shadow-sm hover:shadow-md transition-shadow">
<div class="flex justify-between items-start mb-stack-sm">
<h3 class="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">ACER</h3>
<span class="material-symbols-outlined text-secondary">horizontal_rule</span>
</div>
<div class="font-headline-lg text-headline-lg text-on-surface">1.6%</div>
<div class="mt-stack-sm h-8 flex items-end gap-1">
<div class="w-full bg-secondary/50 rounded-t h-4"></div>
<div class="w-full bg-secondary/50 rounded-t h-5"></div>
<div class="w-full bg-secondary/50 rounded-t h-4"></div>
<div class="w-full bg-secondary/50 rounded-t h-4"></div>
<div class="w-full bg-secondary/50 rounded-t h-5"></div>
</div>
</div>
<!-- FTA Rate -->
<div class="bg-surface-container-lowest p-card-padding rounded-lg border border-outline-variant shadow-sm hover:shadow-md transition-shadow">
<div class="flex justify-between items-start mb-stack-sm">
<h3 class="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">FTA Rate</h3>
<span class="material-symbols-outlined text-primary">info</span>
</div>
<div class="font-headline-lg text-headline-lg text-on-surface">0.12%</div>
<div class="mt-stack-sm h-8 flex items-end gap-1">
<div class="w-full bg-primary/20 rounded-t h-1"></div>
<div class="w-full bg-primary/30 rounded-t h-2"></div>
<div class="w-full bg-primary/20 rounded-t h-1"></div>
<div class="w-full bg-primary/40 rounded-t h-3"></div>
<div class="w-full bg-primary/20 rounded-t h-1"></div>
</div>
</div>
</div>
<!-- Middle Row: Charts -->
<div class="grid grid-cols-1 lg:grid-cols-2 gap-gutter">
<!-- APCER by PAI Species -->
<div class="bg-surface-container-lowest p-card-padding rounded-lg border border-outline-variant shadow-sm flex flex-col h-[300px]">
<h3 class="font-headline-sm text-headline-sm text-on-surface mb-stack-md">APCER by PAI Species</h3>
<div class="flex-1 flex items-end justify-around gap-4 px-4 pb-6 relative border-b border-l border-outline-variant">
<!-- Y axis labels -->
<div class="absolute left-[-24px] top-0 bottom-6 flex flex-col justify-between text-label-md text-on-surface-variant text-right">
<span>3%</span>
<span>2%</span>
<span>1%</span>
</div>
<!-- Bars -->
<div class="w-1/4 h-[80%] bg-primary hover:bg-primary/90 transition-colors rounded-t relative group">
<span class="absolute -top-6 left-1/2 -translate-x-1/2 font-mono-metrics text-mono-metrics opacity-0 group-hover:opacity-100 transition-opacity">2.4%</span>
<span class="absolute -bottom-6 left-1/2 -translate-x-1/2 font-label-md text-label-md text-on-surface-variant whitespace-nowrap">Print</span>
</div>
<div class="w-1/4 h-[40%] bg-secondary hover:bg-secondary/90 transition-colors rounded-t relative group">
<span class="absolute -top-6 left-1/2 -translate-x-1/2 font-mono-metrics text-mono-metrics opacity-0 group-hover:opacity-100 transition-opacity">1.2%</span>
<span class="absolute -bottom-6 left-1/2 -translate-x-1/2 font-label-md text-label-md text-on-surface-variant whitespace-nowrap">Screen</span>
</div>
<div class="w-1/4 h-[60%] bg-tertiary-container hover:bg-tertiary-container/90 transition-colors rounded-t relative group">
<span class="absolute -top-6 left-1/2 -translate-x-1/2 font-mono-metrics text-mono-metrics opacity-0 group-hover:opacity-100 transition-opacity">1.8%</span>
<span class="absolute -bottom-6 left-1/2 -translate-x-1/2 font-label-md text-label-md text-on-surface-variant whitespace-nowrap">Replay</span>
</div>
</div>
</div>
<!-- Scenario Comparison -->
<div class="bg-surface-container-lowest p-card-padding rounded-lg border border-outline-variant shadow-sm flex flex-col h-[300px]">
<h3 class="font-headline-sm text-headline-sm text-on-surface mb-stack-md">Scenario Comparison (ACER)</h3>
<div class="flex-1 relative">
<!-- Simple line chart representation -->
<div class="absolute inset-0 border-b border-l border-outline-variant pb-6">
<div class="absolute left-[-24px] top-0 bottom-6 flex flex-col justify-between text-label-md text-on-surface-variant text-right h-full">
<span>2%</span><span>1%</span><span>0%</span>
</div>
<div class="absolute bottom-[-24px] left-0 right-0 flex justify-between text-label-md text-on-surface-variant px-4">
<span>S1: FaceNet</span>
<span>S2: Rule-Based</span>
<span>S3: Weighted</span>
</div>
<!-- Lines SVG -->
<svg class="w-full h-full" preserveaspectratio="none" viewbox="0 0 100 100">
<polyline class="chart-bar" fill="none" points="10,40 50,70 90,20" stroke="#0001bb" stroke-width="2"></polyline>
<!-- Points -->
<circle class="data-point" cx="10" cy="40" fill="#0001bb" r="3"></circle>
<circle class="data-point" cx="50" cy="70" fill="#0001bb" r="3"></circle>
<circle class="data-point" cx="90" cy="20" fill="#0001bb" r="3"></circle>
</svg>
</div>
</div>
</div>
</div>
<!-- Bottom Row: Analysis -->
<div class="grid grid-cols-1 lg:grid-cols-2 gap-gutter">
<!-- Confusion Matrix -->
<div class="bg-surface-container-lowest p-card-padding rounded-lg border border-outline-variant shadow-sm">
<h3 class="font-headline-sm text-headline-sm text-on-surface mb-stack-md">PAD Confusion Matrix</h3>
<div class="grid grid-cols-[auto_1fr_1fr] grid-rows-[auto_1fr_1fr] gap-1 text-center h-[200px]">
<div class="col-start-2 row-start-1 font-label-md text-on-surface-variant self-end pb-2">Pred: Bona-fide</div>
<div class="col-start-3 row-start-1 font-label-md text-on-surface-variant self-end pb-2">Pred: Attack</div>
<div class="col-start-1 row-start-2 font-label-md text-on-surface-variant self-center pr-2 transform -rotate-90">True: Bona-fide</div>
<div class="col-start-2 row-start-2 bg-secondary-container/50 flex flex-col items-center justify-center rounded">
<span class="font-headline-md text-headline-md text-on-surface">99.2%</span>
<span class="font-label-md text-label-md text-on-surface-variant">True Accept</span>
</div>
<div class="col-start-3 row-start-2 bg-error/20 flex flex-col items-center justify-center rounded">
<span class="font-headline-md text-headline-md text-on-surface">0.8%</span>
<span class="font-label-md text-label-md text-on-surface-variant">BPCER (FN)</span>
</div>
<div class="col-start-1 row-start-3 font-label-md text-on-surface-variant self-center pr-2 transform -rotate-90">True: Attack</div>
<div class="col-start-2 row-start-3 bg-error/40 flex flex-col items-center justify-center rounded">
<span class="font-headline-md text-headline-md text-on-surface">2.4%</span>
<span class="font-label-md text-label-md text-on-surface-variant">APCER (FP)</span>
</div>
<div class="col-start-3 row-start-3 bg-secondary-container/80 flex flex-col items-center justify-center rounded">
<span class="font-headline-md text-headline-md text-on-surface">97.6%</span>
<span class="font-label-md text-label-md text-on-surface-variant">True Reject</span>
</div>
</div>
</div>
<!-- Error Distribution Histogram -->
<div class="bg-surface-container-lowest p-card-padding rounded-lg border border-outline-variant shadow-sm flex flex-col">
<h3 class="font-headline-sm text-headline-sm text-on-surface mb-stack-md">Error Distribution (False Matches)</h3>
<div class="flex-1 flex items-end gap-1 border-b border-outline-variant h-[200px] pb-1 relative">
<!-- X axis indicator -->
<div class="absolute bottom-[-20px] left-0 right-0 flex justify-between text-label-md text-on-surface-variant">
<span>Low Score</span>
<span>High Score</span>
</div>
<!-- Mock Histogram Bars -->
<div class="flex-1 bg-secondary/10 h-[10%] rounded-t"></div>
<div class="flex-1 bg-secondary/20 h-[15%] rounded-t"></div>
<div class="flex-1 bg-secondary/30 h-[25%] rounded-t"></div>
<div class="flex-1 bg-secondary/40 h-[40%] rounded-t"></div>
<div class="flex-1 bg-error/60 h-[80%] rounded-t" title="Threshold Area"></div>
<div class="flex-1 bg-secondary/40 h-[45%] rounded-t"></div>
<div class="flex-1 bg-secondary/30 h-[20%] rounded-t"></div>
<div class="flex-1 bg-secondary/20 h-[10%] rounded-t"></div>
<div class="flex-1 bg-secondary/10 h-[5%] rounded-t"></div>
</div>
</div>
</div>
</div>
<!-- Sidebar Filters -->
<aside class="w-full xl:w-[320px] shrink-0 bg-surface-container-lowest rounded-lg border border-outline-variant p-card-padding">
<div class="flex items-center justify-between mb-stack-lg">
<h2 class="font-headline-sm text-headline-sm text-on-surface">Evaluation Filters</h2>
<span class="bg-primary/20 text-primary px-2 py-1 rounded font-label-md text-label-md">18 Active</span>
</div>
<div class="space-y-stack-lg">
<!-- Configuration Section -->
<div>
<h4 class="font-label-md text-label-md text-on-surface-variant mb-stack-sm uppercase">Configuration</h4>
<select class="w-full border-outline-variant rounded bg-surface text-body-md focus:ring-primary focus:border-primary">
<option>ISO-PAD-Baseline-v2</option>
<option>High-Security-Profile</option>
<option>Mobile-Optimized</option>
</select>
</div>
<!-- Environmental Factors -->
<div>
<h4 class="font-label-md text-label-md text-on-surface-variant mb-stack-sm uppercase">Environmental: Lux</h4>
<div class="space-y-2">
<label class="flex items-center gap-2">
<input checked="" class="rounded text-primary focus:ring-primary" type="checkbox"/>
<span class="font-body-md text-body-md text-on-surface">Dim (&lt; 100 lux)</span>
</label>
<label class="flex items-center gap-2">
<input checked="" class="rounded text-primary focus:ring-primary" type="checkbox"/>
<span class="font-body-md text-body-md text-on-surface">Normal (100 - 300 lux)</span>
</label>
<label class="flex items-center gap-2">
<input class="rounded text-primary focus:ring-primary" type="checkbox"/>
<span class="font-body-md text-body-md text-on-surface">Bright (&gt; 300 lux)</span>
</label>
</div>
</div>
<!-- Sensor Distance -->
<div>
<h4 class="font-label-md text-label-md text-on-surface-variant mb-stack-sm uppercase">Subject Distance</h4>
<div class="flex gap-2">
<button class="flex-1 py-1 border border-primary bg-primary/10 text-primary rounded font-label-md text-label-md">30cm</button>
<button class="flex-1 py-1 border border-primary bg-primary/10 text-primary rounded font-label-md text-label-md">45cm</button>
<button class="flex-1 py-1 border border-outline-variant bg-surface text-on-surface-variant rounded font-label-md text-label-md hover:bg-surface-container-high">60cm</button>
</div>
</div>
<button class="w-full py-2 bg-surface border border-outline-variant text-secondary rounded hover:bg-surface-container-high transition-colors font-label-md text-label-md flex items-center justify-center gap-2">
<span class="material-symbols-outlined text-sm">filter_list</span>
                        More Filters (12)
                    </button>
<button class="w-full py-2 bg-primary text-on-primary rounded hover:bg-primary/90 transition-colors font-label-md text-label-md">
                        Apply Configuration
                    </button>
</div>
</aside>
</div>
</main>
</body></html>
