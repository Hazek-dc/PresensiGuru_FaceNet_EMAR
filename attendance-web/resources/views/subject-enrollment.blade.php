<!DOCTYPE html>

<html lang="en"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>Face Enrollment | Biometric Admin</title>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<script id="tailwind-config">
        tailwind.config = {
            darkMode: "class",
            theme: {
                extend: {
                    colors: {
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
                    borderRadius: {
                        "DEFAULT": "0.125rem",
                        "lg": "0.25rem",
                        "xl": "0.5rem",
                        "full": "0.75rem"
                    },
                    spacing: {
                        "card-padding": "20px",
                        "container-margin": "24px",
                        "stack-md": "16px",
                        "unit": "4px",
                        "stack-sm": "8px",
                        "gutter": "16px",
                        "stack-lg": "24px"
                    },
                    fontFamily: {
                        "headline-sm": ["Inter"],
                        "body-sm": ["Inter"],
                        "body-lg": ["Inter"],
                        "body-md": ["Inter"],
                        "headline-lg": ["Inter"],
                        "label-md": ["Inter"],
                        "headline-md": ["Inter"],
                        "mono-metrics": ["Inter"]
                    },
                    fontSize: {
                        "headline-sm": ["18px", { lineHeight: "26px", fontWeight: "600" }],
                        "body-sm": ["12px", { lineHeight: "16px", fontWeight: "400" }],
                        "body-lg": ["16px", { lineHeight: "24px", fontWeight: "400" }],
                        "body-md": ["14px", { lineHeight: "20px", fontWeight: "400" }],
                        "headline-lg": ["30px", { lineHeight: "38px", letterSpacing: "-0.02em", fontWeight: "700" }],
                        "label-md": ["12px", { lineHeight: "16px", letterSpacing: "0.05em", fontWeight: "600" }],
                        "headline-md": ["24px", { lineHeight: "32px", letterSpacing: "-0.01em", fontWeight: "600" }],
                        "mono-metrics": ["13px", { lineHeight: "18px", letterSpacing: "-0.01em", fontWeight: "500" }]
                    }
                }
            }
        }
    </script>
<style>
        .material-symbols-outlined {
            font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
        }
        .icon-fill {
            font-variation-settings: 'FILL' 1;
        }
    </style>
</head>
<body class="bg-background text-on-background font-body-md h-screen overflow-hidden flex light">
<!-- SideNavBar -->
<aside class="bg-surface dark:bg-on-surface-variant fixed left-0 top-0 h-full w-[260px] border-r border-outline-variant dark:border-on-secondary-fixed-variant flex flex-col h-full py-stack-lg z-20">
<div class="px-card-padding mb-stack-lg">
<div class="flex items-center gap-stack-sm mb-unit">
<div class="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center">
<span class="material-symbols-outlined text-on-primary-container">fingerprint</span>
</div>
<h1 class="font-headline-md text-headline-md font-bold text-primary dark:text-primary-fixed-dim truncate">Biometric Admin</h1>
</div>
<p class="font-body-sm text-body-sm text-secondary truncate">Researcher Role</p>
</div>
<div class="px-card-padding mb-stack-lg">
<div class="flex items-center gap-2 bg-tertiary-container/10 px-3 py-2 rounded-lg border border-tertiary-container/20">
<span class="w-2 h-2 rounded-full bg-tertiary-container animate-pulse"></span>
<span class="font-label-md text-label-md text-tertiary-container">Biometric-API: Online</span>
</div>
</div>
<nav class="flex-1 overflow-y-auto flex flex-col gap-unit">
<a class="flex items-center gap-stack-md px-card-padding py-stack-md text-secondary dark:text-secondary-fixed-dim hover:bg-surface-container-high dark:hover:bg-on-secondary-fixed-variant transition-colors active:scale-[0.98] transition-transform font-body-md text-body-md" href="#">
<span class="material-symbols-outlined">dashboard</span>
                Dashboard
            </a>
<a class="flex items-center gap-stack-md px-card-padding py-stack-md text-secondary dark:text-secondary-fixed-dim hover:bg-surface-container-high dark:hover:bg-on-secondary-fixed-variant transition-colors active:scale-[0.98] transition-transform font-body-md text-body-md" href="#">
<span class="material-symbols-outlined">how_to_reg</span>
                Attendance
            </a>
<a class="flex items-center gap-stack-md px-card-padding py-stack-md text-primary dark:text-primary-fixed-dim border-l-4 border-primary dark:border-primary-fixed-dim bg-primary-container/10 active:scale-[0.98] transition-transform font-body-md text-body-md" href="#">
<span class="material-symbols-outlined icon-fill">group</span>
                Subjects/Enrollment
            </a>
<a class="flex items-center gap-stack-md px-card-padding py-stack-md text-secondary dark:text-secondary-fixed-dim hover:bg-surface-container-high dark:hover:bg-on-secondary-fixed-variant transition-colors active:scale-[0.98] transition-transform font-body-md text-body-md" href="#">
<span class="material-symbols-outlined">phonelink_setup</span>
                Live Verification
            </a>
<a class="flex items-center gap-stack-md px-card-padding py-stack-md text-secondary dark:text-secondary-fixed-dim hover:bg-surface-container-high dark:hover:bg-on-secondary-fixed-variant transition-colors active:scale-[0.98] transition-transform font-body-md text-body-md" href="#">
<span class="material-symbols-outlined">science</span>
                Research Module
            </a>
<a class="flex items-center gap-stack-md px-card-padding py-stack-md text-secondary dark:text-secondary-fixed-dim hover:bg-surface-container-high dark:hover:bg-on-secondary-fixed-variant transition-colors active:scale-[0.98] transition-transform font-body-md text-body-md" href="#">
<span class="material-symbols-outlined">settings</span>
                System Settings
            </a>
</nav>
<div class="mt-auto flex flex-col gap-unit pt-stack-md border-t border-outline-variant dark:border-on-secondary-fixed-variant">
<a class="flex items-center gap-stack-md px-card-padding py-stack-md text-secondary dark:text-secondary-fixed-dim hover:bg-surface-container-high dark:hover:bg-on-secondary-fixed-variant transition-colors active:scale-[0.98] transition-transform font-body-md text-body-md" href="#">
<span class="material-symbols-outlined">help</span>
                Help
            </a>
<a class="flex items-center gap-stack-md px-card-padding py-stack-md text-secondary dark:text-secondary-fixed-dim hover:bg-surface-container-high dark:hover:bg-on-secondary-fixed-variant transition-colors active:scale-[0.98] transition-transform font-body-md text-body-md" href="#">
<span class="material-symbols-outlined">logout</span>
                Logout
            </a>
</div>
</aside>
<!-- TopNavBar -->
<header class="bg-surface dark:bg-on-surface-variant fixed top-0 right-0 w-[calc(100%-260px)] h-16 border-b border-outline-variant dark:border-on-secondary-fixed-variant shadow-sm dark:shadow-none flex justify-between items-center px-container-margin z-10">
<div class="flex items-center gap-stack-md">
<div class="relative flex items-center bg-surface-container-low rounded-full px-3 py-1.5 border border-outline-variant focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
<span class="material-symbols-outlined text-secondary mr-2">search</span>
<input class="bg-transparent border-none outline-none font-body-md text-body-md text-on-surface placeholder:text-secondary w-64" placeholder="Search entity..." type="text"/>
</div>
<nav class="hidden md:flex gap-stack-lg ml-stack-lg font-label-md text-label-md h-full items-center">
<a class="text-on-surface-variant dark:text-secondary-fixed-dim hover:text-primary dark:hover:text-primary-fixed-dim transition-colors h-full flex items-center px-2" href="#">Reports</a>
<a class="text-on-surface-variant dark:text-secondary-fixed-dim hover:text-primary dark:hover:text-primary-fixed-dim transition-colors h-full flex items-center px-2" href="#">Logs</a>
<a class="text-on-surface-variant dark:text-secondary-fixed-dim hover:text-primary dark:hover:text-primary-fixed-dim transition-colors h-full flex items-center px-2" href="#">Audit</a>
</nav>
</div>
<div class="flex items-center gap-stack-md">
<button class="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-secondary transition-colors">
<span class="material-symbols-outlined">notifications</span>
</button>
<button class="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-secondary transition-colors">
<span class="material-symbols-outlined">settings</span>
</button>
<div class="w-8 h-8 rounded-full bg-secondary-container overflow-hidden border border-outline-variant ml-2 cursor-pointer">
<img alt="Researcher Profile" class="w-full h-full object-cover" data-alt="A professional headshot of a researcher with glasses in a well-lit modern laboratory setting, styled in a crisp, clean light-mode corporate aesthetic." src="https://lh3.googleusercontent.com/aida-public/AB6AXuDso4uS9H3Fy78NLUvj5ui3VDMbl2lxL4cJvdOSjYHCXvyUltknO2SSR2bX-swidNEkQms3evuy6by2-qRdLPiQhs3B3XeCrZ_WQVCzg_KTD2t8HPIEby-JshbXgqlXKWPU8rDV4vzKL4U0blGYC_WKz9W-zztLaYMqq4btwT3BsCqzkHWD135dJvXAZXlVDmnA0LktARNel7ejiT2U6Zi0bfN6OmBx0OywxhkVi4DhC3fe_IPkg4YQnzKVHFP2wAlRzOfOyw2T_oc"/>
</div>
</div>
</header>
<!-- Main Content Area -->
<main class="flex-1 ml-[260px] mt-16 p-container-margin overflow-y-auto h-[calc(100vh-64px)]">
<!-- Breadcrumbs & Header -->
<div class="mb-stack-lg">
<div class="flex items-center text-secondary font-body-sm text-body-sm gap-2 mb-2">
<a class="hover:text-primary transition-colors" href="#">Subjects</a>
<span class="material-symbols-outlined text-[14px]">chevron_right</span>
<span class="text-on-surface font-medium">Enrollment</span>
</div>
<h2 class="font-headline-lg text-headline-lg text-on-surface">Subject Registration</h2>
</div>
<!-- Layout Grid -->
<div class="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
<!-- Left Column: Details & Consent -->
<div class="lg:col-span-4 flex flex-col gap-stack-md">
<!-- Subject Details Card -->
<div class="bg-surface-container-lowest border border-outline-variant rounded-xl p-card-padding shadow-sm">
<div class="flex items-center gap-2 mb-stack-md border-b border-outline-variant pb-2">
<span class="material-symbols-outlined text-primary">badge</span>
<h3 class="font-headline-sm text-headline-sm text-on-surface">Subject Details</h3>
</div>
<div class="flex flex-col gap-stack-md">
<div class="flex flex-col gap-1">
<label class="font-body-sm text-body-sm text-on-surface-variant font-medium">Subject ID (Auto-generated)</label>
<input class="bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 font-mono-metrics text-mono-metrics text-secondary cursor-not-allowed" disabled="" type="text" value="SUB-2023-8942A"/>
</div>
<div class="flex flex-col gap-1">
<label class="font-body-sm text-body-sm text-on-surface-variant font-medium">Full Name</label>
<input class="bg-surface-container-lowest border border-outline-variant rounded-lg px-3 py-2 font-body-md text-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" placeholder="Enter official name" type="text"/>
</div>
<div class="flex flex-col gap-1">
<label class="font-body-sm text-body-sm text-on-surface-variant font-medium">Role / Department</label>
<select class="bg-surface-container-lowest border border-outline-variant rounded-lg px-3 py-2 font-body-md text-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all appearance-none">
<option disabled="" selected="" value="">Select primary role</option>
<option value="staff">Staff - Operations</option>
<option value="researcher">Researcher - Tier 1</option>
<option value="admin">Administrator</option>
</select>
</div>
</div>
</div>
<!-- Informed Consent Card -->
<div class="bg-surface-container-lowest border border-outline-variant rounded-xl p-card-padding shadow-sm">
<div class="flex items-center gap-2 mb-stack-md border-b border-outline-variant pb-2">
<span class="material-symbols-outlined text-primary">contract</span>
<h3 class="font-headline-sm text-headline-sm text-on-surface">Informed Consent</h3>
</div>
<div class="border-2 border-dashed border-outline-variant rounded-lg p-stack-md flex flex-col items-center justify-center bg-surface hover:bg-surface-container-low transition-colors cursor-pointer group mb-stack-md text-center">
<div class="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center mb-2 group-hover:bg-primary-container/10 transition-colors">
<span class="material-symbols-outlined text-secondary group-hover:text-primary transition-colors">upload_file</span>
</div>
<p class="font-body-md text-body-md text-on-surface font-medium">Upload Consent Document</p>
<p class="font-body-sm text-body-sm text-secondary mt-1">PDF, JPG up to 10MB</p>
</div>
<button class="w-full bg-surface border border-outline-variant text-on-secondary-container font-label-md text-label-md py-2.5 rounded-lg flex items-center justify-center gap-2 hover:bg-surface-container transition-colors shadow-sm">
<span class="material-symbols-outlined text-[18px]">draw</span>
                        Digital Signature
                    </button>
</div>
</div>
<!-- Right Column: Camera & Extraction -->
<div class="lg:col-span-8 flex flex-col gap-stack-md">
<div class="bg-surface-container-lowest border border-outline-variant rounded-xl p-card-padding shadow-sm flex flex-col h-full">
<div class="flex justify-between items-center mb-stack-md">
<h3 class="font-headline-sm text-headline-sm text-on-surface">Biometric Acquisition</h3>
<div class="flex items-center gap-2">
<span class="w-2 h-2 rounded-full bg-error"></span>
<span class="font-mono-metrics text-mono-metrics text-secondary">Sensor: Standby</span>
</div>
</div>
<!-- Camera Preview Area -->
<div class="relative w-full aspect-video bg-inverse-surface rounded-lg overflow-hidden border border-outline-variant shadow-inner mb-stack-md group">
<div class="absolute inset-0 bg-cover bg-center opacity-80" data-alt="A simulated high-definition digital camera feed displaying a neutral gray grid pattern overlaid with faint cyan biometric scanning brackets, representing a sophisticated facial recognition setup in a sterile, modern light-mode research facility." style="background-image: url('https://lh3.googleusercontent.com/aida-public/AB6AXuBZjtoKdl_IU7AVbkWerMHTxENhQuppRDLTxFYzworeD5whyqs5hxIvHgiJhImbMXdl61BpuQLPiy5a3KQaoTsGK7C-7RVcDdbBb3Oc6UEPLsAn-biVfg6Y4mkwee06XxEWBmdwtSssE-q3NzHSnfUV5u4ggHMS7mbohwIx6aK2Glw4iSzf5FGO3eAO7xn3FuL4V05cpd35ba_4qSYK-Rwi9coY7ljc2o299_2bjHGxb_XYNWoCLSGL9U2YIntuNBBUtbM9bQXSeAo')"></div>
<!-- Overlay UI -->
<div class="absolute inset-0 flex items-center justify-center pointer-events-none">
<div class="w-48 h-64 border-2 border-primary/50 border-dashed rounded-3xl relative">
<div class="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-primary"></div>
<div class="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-primary"></div>
<div class="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-primary"></div>
<div class="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-primary"></div>
</div>
</div>
<div class="absolute bottom-4 left-4 bg-inverse-surface/80 backdrop-blur-sm px-3 py-1.5 rounded text-on-primary font-mono-metrics text-mono-metrics text-[11px] border border-outline-variant/30">
                            CAM_01_FRONTAL | 1080p 60FPS
                        </div>
</div>
<!-- Controls & Status -->
<div class="flex flex-col gap-stack-md mt-auto">
<button class="w-full bg-primary-container text-on-primary py-3.5 rounded-lg font-label-md text-label-md uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-primary transition-colors shadow-sm active:scale-[0.99]">
<span class="material-symbols-outlined">radio_button_checked</span>
                            Start Enrollment (5s Record)
                        </button>
<div class="bg-surface-container-low rounded-lg p-stack-md border border-outline-variant">
<div class="flex justify-between items-center mb-2">
<span class="font-body-sm text-body-sm text-secondary font-medium">Extraction Status</span>
<span class="font-mono-metrics text-mono-metrics text-primary font-bold">0%</span>
</div>
<!-- Progress Bar -->
<div class="w-full h-2 bg-surface-variant rounded-full overflow-hidden mb-3">
<div class="w-[0%] h-full bg-primary-container transition-all duration-300"></div>
</div>
<p class="font-mono-metrics text-mono-metrics text-on-surface-variant text-[12px] flex items-center gap-2">
<span class="material-symbols-outlined text-[16px] animate-spin text-secondary hidden">sync</span>
                                Waiting to initialize sequence...
                            </p>
</div>
<!-- Gallery Indicator -->
<div class="pt-stack-md border-t border-outline-variant flex justify-between items-center">
<p class="font-label-md text-label-md text-on-surface-variant uppercase">Quality Frames (0/5)</p>
<div class="flex gap-2">
<div class="w-12 h-12 bg-surface-variant rounded border border-outline-variant border-dashed"></div>
<div class="w-12 h-12 bg-surface-variant rounded border border-outline-variant border-dashed"></div>
<div class="w-12 h-12 bg-surface-variant rounded border border-outline-variant border-dashed"></div>
<div class="w-12 h-12 bg-surface-variant rounded border border-outline-variant border-dashed"></div>
<div class="w-12 h-12 bg-surface-variant rounded border border-outline-variant border-dashed"></div>
</div>
</div>
</div>
</div>
</div>
</div>
</main>
</body></html>