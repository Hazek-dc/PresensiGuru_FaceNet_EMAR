<!DOCTYPE html>

<html class="light" lang="en"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>Biometric Research Platform - Research Module</title>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
@vite(['resources/js/app.js'])
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<script id="tailwind-config">
        tailwind.config = {
            darkMode: "class",
            theme: {
                extend: {
                    "colors": {
                        "secondary-container": "#d0e1fb",
                        "tertiary-fixed-dim": "#4edea3",
                        "on-primary-container": "#efefff",
                        "surface-variant": "#e0e3e5",
                        "inverse-surface": "#2d3133",
                        "on-secondary-container": "#54647a",
                        "inverse-on-surface": "#eff1f3",
                        "on-primary": "#ffffff",
                        "tertiary-container": "#007d55",
                        "surface-container": "#eceef0",
                        "secondary": "#505f76",
                        "on-surface": "#191c1e",
                        "background": "#f7f9fb",
                        "on-secondary-fixed": "#0b1c30",
                        "tertiary": "#006242",
                        "error": "#ba1a1a",
                        "on-tertiary-fixed": "#002113",
                        "surface-container-high": "#e6e8ea",
                        "on-secondary": "#ffffff",
                        "on-primary-fixed": "#001356",
                        "on-background": "#191c1e",
                        "primary-fixed-dim": "#b8c3ff",
                        "on-tertiary-container": "#bdffdb",
                        "on-tertiary-fixed-variant": "#005236",
                        "on-tertiary": "#ffffff",
                        "surface-dim": "#d8dadc",
                        "primary-fixed": "#dde1ff",
                        "on-surface-variant": "#434656",
                        "inverse-primary": "#b8c3ff",
                        "on-error-container": "#93000a",
                        "outline-variant": "#c4c5d9",
                        "surface-bright": "#f7f9fb",
                        "primary-container": "#2e5bff",
                        "primary": "#0040e0",
                        "on-error": "#ffffff",
                        "surface-container-low": "#f2f4f6",
                        "on-secondary-fixed-variant": "#38485d",
                        "secondary-fixed-dim": "#b7c8e1",
                        "surface-container-lowest": "#ffffff",
                        "surface-tint": "#124af0",
                        "surface-container-highest": "#e0e3e5",
                        "surface": "#f7f9fb",
                        "on-primary-fixed-variant": "#0035be",
                        "secondary-fixed": "#d3e4fe",
                        "tertiary-fixed": "#6ffbbe",
                        "outline": "#747688",
                        "error-container": "#ffdad6"
                    },
                    "borderRadius": {
                        "DEFAULT": "0.125rem",
                        "lg": "0.25rem",
                        "xl": "0.5rem",
                        "full": "0.75rem"
                    },
                    "spacing": {
                        "card-padding": "20px",
                        "container-margin": "24px",
                        "stack-md": "16px",
                        "unit": "4px",
                        "stack-sm": "8px",
                        "gutter": "16px",
                        "stack-lg": "24px"
                    },
                    "fontFamily": {
                        "headline-sm": ["Inter"],
                        "body-sm": ["Inter"],
                        "body-lg": ["Inter"],
                        "body-md": ["Inter"],
                        "headline-lg": ["Inter"],
                        "label-md": ["Inter"],
                        "headline-md": ["Inter"],
                        "mono-metrics": ["Inter"]
                    },
                    "fontSize": {
                        "headline-sm": ["18px", { "lineHeight": "26px", "fontWeight": "600" }],
                        "body-sm": ["12px", { "lineHeight": "16px", "fontWeight": "400" }],
                        "body-lg": ["16px", { "lineHeight": "24px", "fontWeight": "400" }],
                        "body-md": ["14px", { "lineHeight": "20px", "fontWeight": "400" }],
                        "headline-lg": ["30px", { "lineHeight": "38px", "letterSpacing": "-0.02em", "fontWeight": "700" }],
                        "label-md": ["12px", { "lineHeight": "16px", "letterSpacing": "0.05em", "fontWeight": "600" }],
                        "headline-md": ["24px", { "lineHeight": "32px", "letterSpacing": "-0.01em", "fontWeight": "600" }],
                        "mono-metrics": ["13px", { "lineHeight": "18px", "letterSpacing": "-0.01em", "fontWeight": "500" }]
                    }
                }
            }
        }
    </script>
</head>
<body class="bg-background text-on-background font-body-md h-screen overflow-hidden flex">
<!-- SideNavBar -->
<nav aria-label="Sidebar Navigation" class="fixed left-0 top-0 h-full w-[260px] bg-surface dark:bg-on-surface-variant border-r border-outline-variant dark:border-on-secondary-fixed-variant flex flex-col h-full py-stack-lg z-20 hidden md:flex">
<!-- Header -->
<div class="px-card-padding mb-stack-lg">
<div class="flex items-center gap-stack-md">
<img alt="User Profile Avatar" class="w-10 h-10 rounded-full object-cover border border-outline-variant" data-alt="A clean, minimalist 3D rendering of a generic user avatar icon. The avatar should feature smooth, geometric shapes in a professional slate gray and soft blue palette, set against a pristine white background. The lighting should be soft and even, highlighting subtle contours without harsh shadows, perfect for a corporate biometric system dashboard." src="https://lh3.googleusercontent.com/aida-public/AB6AXuDiXjDCkm30t285tm8DxQMW3-WEKMLQEAniPY-rKb_fkHlCRrpMeRXLgxI9-ReM1RpW7ikFhVnXo4n6ZcShKw9U9GtMjdDWLYjjpnATOyhT7MiYkwzRZrQvkQovzk3BJFdxaMkoE52Q5tbsPwy6ilImkgzGTuAuuF0EVdoYnoAp1S7bGiYXdD4S2q1XfkCuTxU7j3tIgrgJM7aZKGG4fJNuv44G4PbRuSxPtcR64A3zhZ-D4XGDBLNbXxBg-Nyt2itogTwVZN6tD0Y"/>
<div>
<h2 class="font-headline-md text-headline-md font-bold text-primary dark:text-primary-fixed-dim">Biometric Admin</h2>
<p class="font-body-sm text-body-sm text-secondary">Researcher Role</p>
</div>
</div>
<div class="mt-stack-md flex items-center gap-2">
<span class="w-2 h-2 rounded-full bg-tertiary-container animate-pulse"></span>
<span class="font-label-md text-label-md text-tertiary-container">Biometric-API: Online</span>
</div>
</div>
<!-- Navigation Links -->
<div class="flex-1 flex flex-col gap-unit overflow-y-auto mt-stack-md">
<a class="flex items-center gap-stack-md px-card-padding py-stack-md text-secondary dark:text-secondary-fixed-dim hover:bg-surface-container-high dark:hover:bg-on-secondary-fixed-variant transition-colors active:scale-[0.98] transition-transform" href="#">
<span class="material-symbols-outlined" data-icon="dashboard">dashboard</span>
<span class="font-body-md text-body-md">Dashboard</span>
</a>
<a class="flex items-center gap-stack-md px-card-padding py-stack-md text-secondary dark:text-secondary-fixed-dim hover:bg-surface-container-high dark:hover:bg-on-secondary-fixed-variant transition-colors active:scale-[0.98] transition-transform" href="#">
<span class="material-symbols-outlined" data-icon="how_to_reg">how_to_reg</span>
<span class="font-body-md text-body-md">Attendance</span>
</a>
<a class="flex items-center gap-stack-md px-card-padding py-stack-md text-secondary dark:text-secondary-fixed-dim hover:bg-surface-container-high dark:hover:bg-on-secondary-fixed-variant transition-colors active:scale-[0.98] transition-transform" href="#">
<span class="material-symbols-outlined" data-icon="group">group</span>
<span class="font-body-md text-body-md">Subjects/Enrollment</span>
</a>
<a class="flex items-center gap-stack-md px-card-padding py-stack-md text-secondary dark:text-secondary-fixed-dim hover:bg-surface-container-high dark:hover:bg-on-secondary-fixed-variant transition-colors active:scale-[0.98] transition-transform" href="#">
<span class="material-symbols-outlined" data-icon="biometric_setup">phonelink_setup</span>
<span class="font-body-md text-body-md">Live Verification</span>
</a>
<a aria-current="page" class="flex items-center gap-stack-md px-card-padding py-stack-md text-primary dark:text-primary-fixed-dim border-l-4 border-primary dark:border-primary-fixed-dim bg-primary-container/10 hover:bg-surface-container-high dark:hover:bg-on-secondary-fixed-variant transition-colors active:scale-[0.98] transition-transform" href="#">
<span class="material-symbols-outlined" data-icon="science">science</span>
<span class="font-body-md text-body-md font-semibold">Research Module</span>
</a>
<a class="flex items-center gap-stack-md px-card-padding py-stack-md text-secondary dark:text-secondary-fixed-dim hover:bg-surface-container-high dark:hover:bg-on-secondary-fixed-variant transition-colors active:scale-[0.98] transition-transform" href="#">
<span class="material-symbols-outlined" data-icon="settings">settings</span>
<span class="font-body-md text-body-md">System Settings</span>
</a>
</div>
<!-- Footer Links -->
<div class="mt-auto border-t border-outline-variant pt-stack-md">
<a class="flex items-center gap-stack-md px-card-padding py-stack-md text-secondary dark:text-secondary-fixed-dim hover:bg-surface-container-high dark:hover:bg-on-secondary-fixed-variant transition-colors active:scale-[0.98] transition-transform" href="#">
<span class="material-symbols-outlined" data-icon="help">help</span>
<span class="font-body-md text-body-md">Help</span>
</a>
<a class="flex items-center gap-stack-md px-card-padding py-stack-md text-secondary dark:text-secondary-fixed-dim hover:bg-surface-container-high dark:hover:bg-on-secondary-fixed-variant transition-colors active:scale-[0.98] transition-transform" href="#">
<span class="material-symbols-outlined" data-icon="logout">logout</span>
<span class="font-body-md text-body-md">Logout</span>
</a>
</div>
</nav>
<!-- Main Content Area -->
<div class="flex-1 md:ml-[260px] flex flex-col h-full">
<!-- TopNavBar -->
<header class="w-full h-16 bg-surface dark:bg-on-surface-variant border-b border-outline-variant dark:border-on-secondary-fixed-variant shadow-sm dark:shadow-none flex justify-between items-center px-container-margin z-10 sticky top-0">
<!-- Mobile Menu Toggle (Visible only on mobile) -->
<button class="md:hidden text-on-surface hover:bg-surface-container-high p-2 rounded-lg transition-colors">
<span class="material-symbols-outlined">menu</span>
</button>
<!-- Brand / Search -->
<div class="flex items-center gap-stack-lg flex-1">
<h1 class="font-headline-sm text-headline-sm font-bold text-on-surface dark:text-inverse-on-surface hidden md:block">Biometric Research Platform</h1>
<!-- Search Bar -->
<div class="relative max-w-md w-full ml-auto md:ml-0">
<span class="material-symbols-outlined absolute left-3 top-1/2 transform -translate-y-1/2 text-secondary text-sm">search</span>
<input class="w-full pl-10 pr-4 py-2 bg-surface-container-low border border-outline-variant rounded-lg font-body-sm text-body-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-on-surface" placeholder="Search parameters or logs..." type="text"/>
</div>
</div>
<!-- Navigation Links (Top) -->
<div class="hidden lg:flex items-center gap-stack-lg mx-stack-lg h-full">
<a class="h-full flex items-center font-label-md text-label-md text-on-surface-variant dark:text-secondary-fixed-dim hover:text-primary dark:hover:text-primary-fixed-dim transition-colors px-2" href="#">Reports</a>
<a class="h-full flex items-center font-label-md text-label-md text-on-surface-variant dark:text-secondary-fixed-dim hover:text-primary dark:hover:text-primary-fixed-dim transition-colors px-2" href="#">Logs</a>
<a class="h-full flex items-center font-label-md text-label-md text-on-surface-variant dark:text-secondary-fixed-dim hover:text-primary dark:hover:text-primary-fixed-dim transition-colors px-2" href="#">Audit</a>
</div>
<!-- Trailing Actions -->
<div class="flex items-center gap-stack-sm ml-auto">
<button aria-label="Notifications" class="text-on-surface-variant hover:bg-surface-container-high p-2 rounded-full transition-colors relative">
<span class="material-symbols-outlined" data-icon="notifications">notifications</span>
<span class="absolute top-1.5 right-1.5 w-2 h-2 bg-error rounded-full border border-surface"></span>
</button>
<button aria-label="Settings" class="text-on-surface-variant hover:bg-surface-container-high p-2 rounded-full transition-colors">
<span class="material-symbols-outlined" data-icon="settings">settings</span>
</button>
<img alt="Researcher Profile" class="w-8 h-8 rounded-full object-cover border border-outline-variant ml-2 cursor-pointer hidden sm:block hover:ring-2 hover:ring-primary transition-all" data-alt="A small, circular profile picture of a young male professional wearing glasses and a crisp white shirt, seen from the chest up. The background is a soft, out-of-focus laboratory environment with cool blue lighting, reflecting the analytical nature of a biometric research setting." src="https://lh3.googleusercontent.com/aida-public/AB6AXuD3KgdL4w-B4EN_QRQY8dUgOb-H5OpqxoMKWLD5sE0Y8KuN9fGKwIf35x_jMYEi00shfPhZom8dqEk_h0MS4EjBXSwDltOEq0OjWKvJi4FcG_PVgyFXRPqs_Yi0Kk9JGRAc50agIUbpT0g4ociDCSdcKc7pztKIrK06KVSalyJKOocT0r_0auSepM518WG8fryJdbQ8s0xstNd8zMB3k5qz1pqZGF0m-UWTwQIfVw_eVJCdplKzZFTLRS0bprZnvfLYqqcQ0CY-9gk"/>
</div>
</header>
<!-- Main Canvas -->
<main class="flex-1 overflow-y-auto p-container-margin bg-background">
<!-- Page Title -->
<div class="mb-stack-lg flex flex-col sm:flex-row sm:items-end justify-between gap-4">
<div>
<h2 class="font-headline-lg text-headline-lg text-on-surface">Dataset &amp; Testing Management</h2>
<p class="font-body-md text-body-md text-secondary mt-1">Configure evaluation pipelines and review attack simulation logs.</p>
</div>
<div class="flex gap-2">
<button class="px-4 py-2 bg-transparent border border-outline-variant text-secondary font-label-md text-label-md rounded-lg hover:bg-surface-container-low transition-colors flex items-center gap-2">
<span class="material-symbols-outlined text-[18px]">download</span> Export Report
                    </button>
</div>
</div>
<!-- Bento Grid Layout -->
<div class="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
<!-- Pipeline & Simulation Controls (Left Column) -->
<div class="lg:col-span-4 flex flex-col gap-gutter">
<!-- Runner Panel -->
<div class="bg-surface rounded-xl border border-outline-variant p-card-padding shadow-sm">
<div class="flex items-center gap-2 mb-4">
<span class="material-symbols-outlined text-primary">play_circle</span>
<h3 class="font-headline-sm text-headline-sm text-on-surface">Offline Evaluation Runner</h3>
</div>
<div class="space-y-4">
<div>
<label class="block font-body-sm text-body-sm text-secondary mb-1">Target Engine</label>
<select class="w-full p-2 bg-surface border border-outline-variant rounded-lg font-body-md text-body-md focus:border-primary focus:ring-1 focus:ring-primary text-on-surface">
<option>BioCore v3.2.1</option>
<option>Liveness Detection v2.0</option>
<option>Legacy Matcher</option>
</select>
</div>
<!-- Simulation Mode Toggles -->
<div>
<label class="block font-body-sm text-body-sm text-secondary mb-2">Active Simulation Modes</label>
<div class="space-y-2">
<label class="flex items-center justify-between p-3 border border-outline-variant rounded-lg hover:bg-surface-container-low cursor-pointer transition-colors group">
<div class="flex items-center gap-3">
<span class="material-symbols-outlined text-secondary group-hover:text-primary transition-colors">print</span>
<span class="font-body-md text-body-md text-on-surface font-medium">Print Attack</span>
</div>
<input checked="" class="form-checkbox h-4 w-4 text-primary border-outline rounded focus:ring-primary" type="checkbox"/>
</label>
<label class="flex items-center justify-between p-3 border border-outline-variant rounded-lg hover:bg-surface-container-low cursor-pointer transition-colors group">
<div class="flex items-center gap-3">
<span class="material-symbols-outlined text-secondary group-hover:text-primary transition-colors">smartphone</span>
<span class="font-body-md text-body-md text-on-surface font-medium">Screen Attack</span>
</div>
<input checked="" class="form-checkbox h-4 w-4 text-primary border-outline rounded focus:ring-primary" type="checkbox"/>
</label>
<label class="flex items-center justify-between p-3 border border-outline-variant rounded-lg hover:bg-surface-container-low cursor-pointer transition-colors group">
<div class="flex items-center gap-3">
<span class="material-symbols-outlined text-secondary group-hover:text-primary transition-colors">videocam</span>
<span class="font-body-md text-body-md text-on-surface font-medium">Replay Attack</span>
</div>
<input class="form-checkbox h-4 w-4 text-primary border-outline rounded focus:ring-primary" type="checkbox"/>
</label>
</div>
</div>
<button class="w-full mt-4 py-3 bg-primary text-on-primary font-label-md text-label-md rounded-lg hover:bg-primary-container hover:text-on-primary-container transition-colors shadow-sm flex items-center justify-center gap-2">
<span class="material-symbols-outlined text-[20px]">bolt</span> Execute Pipeline
                            </button>
</div>
</div>
<!-- Upload Manifest Area -->
<div class="bg-surface rounded-xl border border-outline-variant p-card-padding shadow-sm">
<div class="flex items-center justify-between mb-4">
<h3 class="font-headline-sm text-headline-sm text-on-surface">Dataset Manifest</h3>
<span class="px-2 py-1 bg-tertiary-container/20 text-tertiary-container rounded text-xs font-semibold flex items-center gap-1">
<span class="material-symbols-outlined text-[14px]">check_circle</span> Validated
                            </span>
</div>
<div class="border-2 border-dashed border-outline-variant rounded-lg p-6 text-center hover:bg-surface-container-low transition-colors cursor-pointer group">
<span class="material-symbols-outlined text-[32px] text-secondary group-hover:text-primary mb-2 transition-colors">upload_file</span>
<p class="font-body-md text-body-md text-on-surface font-medium">Upload Manifest (MANIFEST_UJI.csv)</p>
<p class="font-body-sm text-body-sm text-secondary mt-1">Drag &amp; drop or click to browse</p>
</div>
<div class="mt-4 p-3 bg-surface-container-low border border-outline-variant rounded-lg flex items-center gap-3">
<span class="material-symbols-outlined text-secondary">csv</span>
<div class="flex-1 overflow-hidden">
<p class="font-body-sm text-body-sm text-on-surface font-medium truncate">MANIFEST_UJI_v2.csv</p>
<p class="font-body-sm text-body-sm text-secondary text-[10px]">1.2 MB • Uploaded 10m ago</p>
</div>
<button class="text-secondary hover:text-error transition-colors">
<span class="material-symbols-outlined text-[18px]">delete</span>
</button>
</div>
</div>
</div>
<!-- Dataset Management & Audit (Right Column) -->
<div class="lg:col-span-8 flex flex-col gap-gutter">
<!-- Dataset Management Table -->
<div class="bg-surface rounded-xl border border-outline-variant flex flex-col flex-1 shadow-sm overflow-hidden">
<div class="p-4 border-b border-outline-variant flex justify-between items-center bg-surface-bright">
<h3 class="font-headline-sm text-headline-sm text-on-surface">Test Samples Log</h3>
<div class="flex gap-2">
<button class="p-1.5 text-secondary hover:bg-surface-container-high rounded transition-colors" title="Filter">
<span class="material-symbols-outlined text-[20px]">filter_list</span>
</button>
<button class="p-1.5 text-secondary hover:bg-surface-container-high rounded transition-colors" title="Refresh">
<span class="material-symbols-outlined text-[20px]">refresh</span>
</button>
</div>
</div>
<div class="overflow-x-auto flex-1">
<table class="w-full text-left border-collapse">
<thead class="bg-surface-container-low sticky top-0 z-10">
<tr>
<th class="p-3 font-label-md text-label-md text-secondary border-b border-outline-variant whitespace-nowrap">Sample_ID</th>
<th class="p-3 font-label-md text-label-md text-secondary border-b border-outline-variant whitespace-nowrap">Sample_Type</th>
<th class="p-3 font-label-md text-label-md text-secondary border-b border-outline-variant whitespace-nowrap">PAI_Species</th>
<th class="p-3 font-label-md text-label-md text-secondary border-b border-outline-variant whitespace-nowrap">Lux</th>
<th class="p-3 font-label-md text-label-md text-secondary border-b border-outline-variant whitespace-nowrap">Distance</th>
<th class="p-3 font-label-md text-label-md text-secondary border-b border-outline-variant whitespace-nowrap">Session</th>
<th class="p-3 font-label-md text-label-md text-secondary border-b border-outline-variant whitespace-nowrap">Result</th>
</tr>
</thead>
<tbody class="font-body-sm text-body-sm text-on-surface divide-y divide-outline-variant/50">
<tr class="hover:bg-surface-container-low/50 transition-colors">
<td class="p-3 font-mono-metrics text-secondary">SMP-8492</td>
<td class="p-3 font-medium">Bona Fide</td>
<td class="p-3 text-secondary">-</td>
<td class="p-3 font-mono-metrics">450</td>
<td class="p-3 font-mono-metrics">0.3m</td>
<td class="p-3">Sess_A1</td>
<td class="p-3"><span class="px-2 py-0.5 bg-tertiary-container/10 text-tertiary-container rounded text-[11px] font-semibold">Pass</span></td>
</tr>
<tr class="hover:bg-surface-container-low/50 transition-colors">
<td class="p-3 font-mono-metrics text-secondary">SMP-8493</td>
<td class="p-3 font-medium">Attack</td>
<td class="p-3 text-on-surface">Laser Print (Matte)</td>
<td class="p-3 font-mono-metrics">450</td>
<td class="p-3 font-mono-metrics">0.3m</td>
<td class="p-3">Sess_A1</td>
<td class="p-3"><span class="px-2 py-0.5 bg-tertiary-container/10 text-tertiary-container rounded text-[11px] font-semibold">Blocked</span></td>
</tr>
<tr class="hover:bg-surface-container-low/50 transition-colors">
<td class="p-3 font-mono-metrics text-secondary">SMP-8494</td>
<td class="p-3 font-medium">Attack</td>
<td class="p-3 text-on-surface">iPad Retina Display</td>
<td class="p-3 font-mono-metrics">200</td>
<td class="p-3 font-mono-metrics">0.5m</td>
<td class="p-3">Sess_A2</td>
<td class="p-3"><span class="px-2 py-0.5 bg-tertiary-container/10 text-tertiary-container rounded text-[11px] font-semibold">Blocked</span></td>
</tr>
<tr class="hover:bg-surface-container-low/50 transition-colors">
<td class="p-3 font-mono-metrics text-secondary">SMP-8495</td>
<td class="p-3 font-medium">Bona Fide</td>
<td class="p-3 text-secondary">-</td>
<td class="p-3 font-mono-metrics">15</td>
<td class="p-3 font-mono-metrics">0.4m</td>
<td class="p-3">Sess_A2</td>
<td class="p-3"><span class="px-2 py-0.5 bg-error/10 text-error rounded text-[11px] font-semibold">False Reject</span></td>
</tr>
<tr class="hover:bg-surface-container-low/50 transition-colors">
<td class="p-3 font-mono-metrics text-secondary">SMP-8496</td>
<td class="p-3 font-medium">Attack</td>
<td class="p-3 text-on-surface">3D Mask (Silicone)</td>
<td class="p-3 font-mono-metrics">300</td>
<td class="p-3 font-mono-metrics">0.3m</td>
<td class="p-3">Sess_A3</td>
<td class="p-3"><span class="px-2 py-0.5 bg-error/10 text-error rounded text-[11px] font-semibold">False Accept</span></td>
</tr>
</tbody>
</table>
</div>
<div class="p-3 border-t border-outline-variant bg-surface-bright flex justify-between items-center text-xs text-secondary">
<span>Showing 1 to 5 of 1,240 entries</span>
<div class="flex gap-1">
<button class="px-2 py-1 border border-outline-variant rounded hover:bg-surface-container-low disabled:opacity-50" disabled="">Prev</button>
<button class="px-2 py-1 border border-outline-variant rounded hover:bg-surface-container-low">Next</button>
</div>
</div>
</div>
<!-- Audit Log Mini-Panel -->
<div class="bg-surface rounded-xl border border-outline-variant p-card-padding shadow-sm">
<div class="flex items-center justify-between mb-4">
<h3 class="font-headline-sm text-headline-sm text-on-surface">Recent Research Sessions Audit</h3>
<a class="text-primary font-label-md text-label-md hover:underline" href="#">View All</a>
</div>
<div class="space-y-3">
<div class="flex gap-3 items-start">
<div class="mt-1 w-2 h-2 rounded-full bg-outline"></div>
<div>
<p class="font-body-sm text-body-sm text-on-surface"><span class="font-semibold">Sess_A3 completed.</span> Pipeline execution finished for 500 samples.</p>
<p class="text-[10px] text-secondary font-mono-metrics mt-0.5">Today, 14:32:01 | User: Peneliti_01</p>
</div>
</div>
<div class="flex gap-3 items-start">
<div class="mt-1 w-2 h-2 rounded-full bg-tertiary-container"></div>
<div>
<p class="font-body-sm text-body-sm text-on-surface"><span class="font-semibold">MANIFEST_UJI_v2.csv validated.</span> Schema matches expected parameters.</p>
<p class="text-[10px] text-secondary font-mono-metrics mt-0.5">Today, 14:20:15 | System</p>
</div>
</div>
<div class="flex gap-3 items-start">
<div class="mt-1 w-2 h-2 rounded-full bg-outline"></div>
<div>
<p class="font-body-sm text-body-sm text-on-surface"><span class="font-semibold">Simulation Config Updated.</span> Added 'Replay Attack' to active matrix.</p>
<p class="text-[10px] text-secondary font-mono-metrics mt-0.5">Today, 10:15:44 | User: Admin_Sys</p>
</div>
</div>
</div>
</div>
</div>
</div>
</main>
</div>
</body></html>