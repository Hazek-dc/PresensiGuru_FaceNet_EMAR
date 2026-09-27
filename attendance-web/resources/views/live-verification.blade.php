<!-- Live Verification - Blue Horizon -->
<!DOCTYPE html>

<html class="light" lang="en"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>Live Biometric Verification</title>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
@vite(['resources/js/app.tsx'])
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
                "headline-lg-mobile": [
                        "Hanken Grotesk"
                ],
                "label-md": [
                        "JetBrains Mono"
                ],
                "display-xl": [
                        "Hanken Grotesk"
                ],
                "label-sm": [
                        "JetBrains Mono"
                ],
                "headline-md": [
                        "Hanken Grotesk"
                ],
                "headline-lg": [
                        "Hanken Grotesk"
                ],
                "body-sm": [
                        "Inter"
                ],
                "body-lg": [
                        "Inter"
                ],
                "body-md": [
                        "Inter"
                ],
                "headline-sm": [
                        "Hanken Grotesk"
                ],
                "mono-metrics": [
                        "JetBrains Mono"
                ]
        },
        "fontSize": {
                "headline-lg-mobile": [
                        "24px",
                        {
                                "lineHeight": "32px",
                                "fontWeight": "600"
                        }
                ],
                "label-md": [
                        "13px",
                        {
                                "lineHeight": "16px",
                                "letterSpacing": "0.05em",
                                "fontWeight": "500"
                        }
                ],
                "display-xl": [
                        "48px",
                        {
                                "lineHeight": "56px",
                                "letterSpacing": "-0.02em",
                                "fontWeight": "700"
                        }
                ],
                "label-sm": [
                        "11px",
                        {
                                "lineHeight": "14px",
                                "letterSpacing": "0.03em",
                                "fontWeight": "500"
                        }
                ],
                "headline-md": [
                        "24px",
                        {
                                "lineHeight": "32px",
                                "fontWeight": "600"
                        }
                ],
                "headline-lg": [
                        "32px",
                        {
                                "lineHeight": "40px",
                                "fontWeight": "600"
                        }
                ],
                "body-sm": [
                        "14px",
                        {
                                "lineHeight": "20px",
                                "fontWeight": "400"
                        }
                ],
                "body-lg": [
                        "18px",
                        {
                                "lineHeight": "28px",
                                "fontWeight": "400"
                        }
                ],
                "body-md": [
                        "16px",
                        {
                                "lineHeight": "24px",
                                "fontWeight": "400"
                        }
                ],
                "headline-sm": ["18px", { "lineHeight": "26px", "fontWeight": "600" }],
                "mono-metrics": ["13px", { "lineHeight": "18px", "letterSpacing": "-0.01em", "fontWeight": "500" }]
        }
},
    },
  }
</script>
<style>
        @import url('https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        body { font-family: 'Inter', sans-serif; }
        .material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; }
        .material-symbols-outlined[data-weight="fill"] { font-variation-settings: 'FILL' 1; }
        
        .pulse-dot {
            animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: .5; transform: scale(1.2); }
        }
        
        .bounding-box {
            position: absolute;
            border: 2px dashed #0001bb;
            box-shadow: 0 0 10px rgba(0, 1, 187, 0.3);
            animation: scan 3s ease-in-out infinite alternate;
        }
        @keyframes scan {
            0% { transform: scale(0.98); border-color: rgba(0, 1, 187, 0.8); }
            100% { transform: scale(1.02); border-color: rgba(0, 1, 187, 1); }
        }
        
        /* Glassmorphism utility */
        .glass-panel {
            background: rgba(255, 255, 255, 0.8);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border: 1px solid rgba(226, 232, 240, 0.6);
        }
    </style>
</head>
<body data-attendance-capture class="bg-background text-on-background min-h-screen font-body-md text-body-md selection:bg-primary-container/30">
<!-- SideNavBar (Shared Component) -->
<nav class="fixed left-0 top-0 h-full w-[260px] bg-surface dark:bg-on-surface-variant border-r border-outline-variant dark:border-on-secondary-fixed-variant flex flex-col py-stack-lg z-50">
<div class="px-container-margin mb-stack-lg">
<h1 class="font-headline-md text-headline-md font-bold text-primary dark:text-primary-fixed-dim">Biometric Admin</h1>
<p class="font-body-sm text-body-sm text-secondary mt-1">Researcher Role</p>
</div>
<div class="flex-1 overflow-y-auto px-unit">
<ul class="space-y-unit">
<li>
<a class="flex items-center gap-stack-md px-card-padding py-stack-md text-secondary dark:text-secondary-fixed-dim hover:bg-surface-container-high dark:hover:bg-on-secondary-fixed-variant transition-colors active:scale-[0.98] rounded-r-lg" href="#">
<span class="material-symbols-outlined" data-icon="dashboard">dashboard</span>
<span class="font-label-md text-label-md">Dashboard</span>
</a>
</li>
<li>
<a class="flex items-center gap-stack-md px-card-padding py-stack-md text-secondary dark:text-secondary-fixed-dim hover:bg-surface-container-high dark:hover:bg-on-secondary-fixed-variant transition-colors active:scale-[0.98] rounded-r-lg" href="#">
<span class="material-symbols-outlined" data-icon="how_to_reg">how_to_reg</span>
<span class="font-label-md text-label-md">Attendance</span>
</a>
</li>
<li>
<a class="flex items-center gap-stack-md px-card-padding py-stack-md text-secondary dark:text-secondary-fixed-dim hover:bg-surface-container-high dark:hover:bg-on-secondary-fixed-variant transition-colors active:scale-[0.98] rounded-r-lg" href="#">
<span class="material-symbols-outlined" data-icon="group">group</span>
<span class="font-label-md text-label-md">Subjects/Enrollment</span>
</a>
</li>
<li>
<!-- ACTIVE STATE -->
<a class="flex items-center gap-stack-md px-card-padding py-stack-md text-primary dark:text-primary-fixed-dim border-l-4 border-primary dark:border-primary-fixed-dim bg-primary-container/10 active:scale-[0.98] transition-transform rounded-r-lg" href="#">
<span class="material-symbols-outlined" data-icon="biometric_setup">phonelink_setup</span>
<span class="font-label-md text-label-md">Live Verification</span>
</a>
</li>
<li>
<a class="flex items-center gap-stack-md px-card-padding py-stack-md text-secondary dark:text-secondary-fixed-dim hover:bg-surface-container-high dark:hover:bg-on-secondary-fixed-variant transition-colors active:scale-[0.98] rounded-r-lg" href="#">
<span class="material-symbols-outlined" data-icon="science">science</span>
<span class="font-label-md text-label-md">Research Module</span>
</a>
</li>
<li>
<a class="flex items-center gap-stack-md px-card-padding py-stack-md text-secondary dark:text-secondary-fixed-dim hover:bg-surface-container-high dark:hover:bg-on-secondary-fixed-variant transition-colors active:scale-[0.98] rounded-r-lg" href="#">
<span class="material-symbols-outlined" data-icon="settings">settings</span>
<span class="font-label-md text-label-md">System Settings</span>
</a>
</li>
</ul>
</div>
<div class="px-container-margin mt-auto pt-stack-lg border-t border-outline-variant/30">
<div class="flex items-center gap-2 mb-stack-md">
<div class="w-2 h-2 rounded-full bg-primary-fixed pulse-dot"></div>
<span class="font-mono-metrics text-mono-metrics text-primary">Biometric-API: Online</span>
</div>
<ul class="space-y-unit">
<li>
<a class="flex items-center gap-stack-md px-card-padding py-stack-sm text-secondary hover:text-primary transition-colors" href="#">
<span class="material-symbols-outlined text-sm" data-icon="help">help</span>
<span class="font-label-md text-label-md">Help</span>
</a>
</li>
<li>
<a class="flex items-center gap-stack-md px-card-padding py-stack-sm text-secondary hover:text-error transition-colors" href="#">
<span class="material-symbols-outlined text-sm" data-icon="logout">logout</span>
<span class="font-label-md text-label-md">Logout</span>
</a>
</li>
</ul>
</div>
</nav>
<!-- TopNavBar (Shared Component) -->
<header class="fixed top-0 right-0 w-[calc(100%-260px)] h-16 bg-surface dark:bg-on-surface-variant border-b border-outline-variant dark:border-on-secondary-fixed-variant shadow-sm flex justify-between items-center px-container-margin z-40">
<div class="flex items-center gap-stack-lg">
<span class="font-headline-sm text-headline-sm font-bold text-on-surface dark:text-inverse-on-surface">Biometric Research Platform</span>
<!-- Navigation Links -->
<nav class="hidden md:flex gap-stack-md ml-stack-lg">
<a class="font-label-md text-label-md text-on-surface-variant dark:text-secondary-fixed-dim hover:text-primary transition-colors h-16 flex items-center" href="#">Reports</a>
<a class="font-label-md text-label-md text-on-surface-variant dark:text-secondary-fixed-dim hover:text-primary transition-colors h-16 flex items-center" href="#">Logs</a>
<a class="font-label-md text-label-md text-on-surface-variant dark:text-secondary-fixed-dim hover:text-primary transition-colors h-16 flex items-center" href="#">Audit</a>
</nav>
</div>
<div class="flex items-center gap-stack-md">
<button class="p-2 text-secondary hover:text-primary transition-colors active:opacity-80 rounded-full hover:bg-surface-container">
<span class="material-symbols-outlined" data-icon="notifications">notifications</span>
</button>
<button class="p-2 text-secondary hover:text-primary transition-colors active:opacity-80 rounded-full hover:bg-surface-container">
<span class="material-symbols-outlined" data-icon="settings">settings</span>
</button>
<div class="w-8 h-8 rounded-full overflow-hidden border border-outline-variant ml-2">
<img alt="Researcher Profile" class="w-full h-full object-cover" data-alt="A professional headshot of a female security researcher in a modern, well-lit lab environment. High-key lighting, corporate minimalist aesthetic, sharp focus." src="https://lh3.googleusercontent.com/aida-public/AB6AXuBDq4cBhP91e4rvv13MgMJByrssDVkK9fYYZghY5I4Yy9fUhA_aR6nZi5VrAZ9z-I_2RKM-5_u8jMQ32GGTgBqSSG6Thnm1uK4PqlcnjROxnOL6vRJ985DhcAMzZjM4iIz6Rf9Oo_sJ53Xb0n3qxfr1C_3O8e--FMWU1iDzjK2quTx7-8y_xHH3ZG7mCp8TicJlvXGaGDXlefaGCY2lLmIKtufIPm1rgZO4Nkjwx9HZ19aHtnCqnzTPbJ9OolMUHS4QlTGG6vzM6qA"/>
</div>
</div>
</header>
<!-- Main Content Canvas -->
<main class="ml-[260px] pt-16 min-h-screen p-container-margin">
<!-- Header & Identity Claim -->
<div class="flex justify-between items-end mb-stack-lg">
<div>
<h2 class="font-headline-lg text-headline-lg text-on-background mb-1">Live Inference</h2>
<p class="font-body-md text-body-md text-secondary">Real-time 1:1 facial verification &amp; liveness detection.</p>
</div>
<div class="w-72">
<label class="block font-label-md text-label-md text-secondary mb-1">Claimed Identity (Guru/Staf)</label>
<div class="relative">
<span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-secondary">search</span>
<input class="w-full pl-10 pr-4 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg font-body-md text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" placeholder="Search ID or Name..." type="text"/>
</div>
</div>
</div>
<!-- Asymmetric Layout: Viewfinder + Results -->
<div class="grid grid-cols-12 gap-gutter">
<!-- Central Camera Viewfinder (Left Col) -->
<div class="col-span-12 lg:col-span-8 relative">
<!-- Camera Container -->
<div class="relative w-full aspect-video bg-inverse-surface rounded-xl overflow-hidden border border-surface-variant shadow-sm group">
<!-- Real Camera Feed -->
<video data-camera-preview class="w-full h-full object-cover" autoplay playsinline muted></video>
<img data-recording-preview hidden class="w-full h-full object-cover" />
<!-- Grid Overlay -->
<div class="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none"></div>
<!-- MTCNN Bounding Box -->
<div class="bounding-box w-1/3 h-1/2 left-[33%] top-[20%] rounded-sm">
<!-- Corner Markers -->
<div class="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-primary-container"></div>
<div class="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-primary-container"></div>
<div class="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-primary-container"></div>
<div class="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-primary-container"></div>
<!-- HUD Info near box -->
<div class="absolute -top-6 left-0 bg-primary-container text-on-primary text-[10px] font-mono-metrics px-2 py-0.5 rounded-sm whitespace-nowrap">
                            FACE_DETECTED [0.99]
                        </div>
</div>
<!-- Top Status Overlay (HUD) -->
<div class="absolute top-4 left-4 right-4 flex justify-between pointer-events-none">
<div class="glass-panel px-3 py-1.5 rounded-lg flex items-center gap-2 shadow-sm">
<span class="w-2 h-2 rounded-full bg-primary-fixed pulse-dot"></span>
<span class="font-mono-metrics text-mono-metrics text-on-surface">EMAR Liveness: [Blink Detected]</span>
</div>
<div class="glass-panel px-3 py-1.5 rounded-lg flex items-center gap-2 shadow-sm">
<span class="material-symbols-outlined text-secondary text-sm">straighten</span>
<span class="font-mono-metrics text-mono-metrics text-on-surface">Distance: 60cm</span>
</div>
</div>
<!-- Bottom Controls Overlay -->
<div class="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-4">
<button data-start-recording class="bg-primary text-on-primary px-6 py-2.5 rounded-lg font-label-md text-label-md shadow-md hover:bg-primary-fixed-dim transition-colors flex items-center gap-2">
<span class="material-symbols-outlined" data-weight="fill">camera</span>
                            Start Capture
                        </button>
<button data-stop-recording disabled class="bg-error text-on-error px-6 py-2.5 rounded-lg font-label-md text-label-md shadow-md hover:bg-error/90 transition-colors flex items-center gap-2">
<span class="material-symbols-outlined" data-weight="fill">stop_circle</span>
                            Stop Capture
                        </button>
</div>
<div data-capture-status class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-surface/90 px-4 py-2 rounded-lg font-label-md text-label-md text-secondary shadow-lg z-50 empty:hidden"></div>
</div>
</div>
<!-- Results Panel (Right Col) -->
<div class="col-span-12 lg:col-span-4 flex flex-col gap-stack-md">
<!-- Status Card -->
<div class="bg-surface-container-lowest rounded-xl border border-outline-variant p-card-padding shadow-sm relative overflow-hidden">
<!-- Accent Line -->
<div class="absolute left-0 top-0 bottom-0 w-1 bg-primary"></div>
<h3 class="font-label-md text-label-md text-secondary mb-2 uppercase tracking-wider">Inference Result</h3>
<div class="flex items-center gap-3 mb-4">
<span class="material-symbols-outlined text-primary text-3xl" data-weight="fill">check_circle</span>
<span class="font-headline-md text-headline-md font-bold text-primary">VERIFIED</span>
</div>
<div class="space-y-4">
<!-- Metric 1 -->
<div>
<div class="flex justify-between font-label-md text-label-md mb-1">
<span class="text-secondary">FaceNet Match Score</span>
<span class="text-on-surface font-mono-metrics">0.84</span>
</div>
<div class="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
<div class="h-full bg-primary w-[84%] rounded-full"></div>
</div>
</div>
<!-- Metric 2 -->
<div>
<div class="flex justify-between font-label-md text-label-md mb-1">
<span class="text-secondary">Liveness Confidence</span>
<span class="text-on-surface font-mono-metrics">98%</span>
</div>
<div class="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
<div class="h-full bg-primary-container w-[98%] rounded-full"></div>
</div>
</div>
</div>
<div class="mt-4 pt-4 border-t border-surface-variant">
<p class="font-body-sm text-body-sm text-secondary">
<strong class="text-on-surface">Reason:</strong> Identity Match confirmed via vector distance threshold (&le; 0.40). Presentation Attack (PAI) negative.
                        </p>
</div>
</div>
<!-- Secondary Actions & Data -->
<div class="bg-surface-container-lowest rounded-xl border border-outline-variant p-card-padding shadow-sm">
<h3 class="font-label-md text-label-md text-secondary mb-4 uppercase tracking-wider">Subject Data</h3>
<div class="flex items-center gap-4 mb-4">
<div class="w-12 h-12 rounded-lg bg-surface-variant border border-outline-variant overflow-hidden">
<img class="w-full h-full object-cover" data-alt="A small passport-style reference photo of a male staff member against a blue background. Professional, clear, standard ID photo." src="https://lh3.googleusercontent.com/aida-public/AB6AXuBnclNJO6PqSFvaEndsm20yAOya_gG22pR3zjVnHhaR1VeyiGgqL3WAl6qDM_KVoSlB_5TeteCw1N_rdLxuejAmOHq-4MMT5LGyMxxe8tcwyO-SoEO8hoLgogqXDPxmNf5unDunUYKMbR36f9_fqPoQkpIg7RWoUzkr2kZkSQOZ97YTNxhMkYfSplsfp2btSvSzNiJ2eT9sfLoXACbHhgWi02Z482Xq4fILjlZmVM1J83kwA5fu0ftkCaKEHt880UyLwXszC2z6MYE"/>
</div>
<div>
<p class="font-label-md text-label-md text-on-surface">Dr. Robert Chen</p>
<p class="font-body-sm text-body-sm text-secondary">ID: STF-88291</p>
</div>
</div>
<div class="flex gap-3 mt-6">
<button class="flex-1 bg-surface text-secondary border border-outline-variant px-4 py-2 rounded-lg font-label-md text-label-md hover:bg-surface-variant transition-colors flex items-center justify-center gap-2">
<span class="material-symbols-outlined text-sm">refresh</span>
                             Re-try
                         </button>
<button class="flex-1 bg-secondary-container text-on-secondary-container px-4 py-2 rounded-lg font-label-md text-label-md hover:bg-primary-fixed-dim transition-colors flex items-center justify-center gap-2">
<span class="material-symbols-outlined text-sm">history</span>
                             Logs
                         </button>
</div>
</div>
</div>
</div>
</div>
</main>
<script>
    document.addEventListener('attendance:capture-ready', async (e) => {
        const statusEl = document.querySelector('[data-capture-status]');
        statusEl.textContent = 'Uploading to API...';
        
        const { recording, still } = e.detail;
        const formData = new FormData();
        formData.append('video', recording, 'capture.webm');
        
        // Find claimed_subject_id from the input field
        const idInput = document.querySelector('input[placeholder="Search ID or Name..."]');
        const claimed_subject_id = idInput ? idInput.value || 'EMP-TEST' : 'EMP-TEST';
        formData.append('claimed_subject_id', claimed_subject_id);

        try {
            // Mocking Laravel endpoint call for E2E
            const response = await fetch('http://127.0.0.1:8001/api/v1/verify', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            statusEl.textContent = `Result: ${data.final_decision}`;
            
            // If accepted, could show the checkmark on the right panel
        } catch (error) {
            statusEl.textContent = 'Error calling API: ' + error.message;
        }
    });
</script>
</body></html>
