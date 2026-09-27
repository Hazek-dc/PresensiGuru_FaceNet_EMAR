import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface Biometric3DCanvasProps {
    className?: string;
    interactive?: boolean;
}

export default function Biometric3DCanvas({
    className = 'h-full w-full',
    interactive = true,
}: Biometric3DCanvasProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Scene, Camera, Renderer
        const scene = new THREE.Scene();
        const width = container.clientWidth || 400;
        const height = container.clientHeight || 400;

        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        camera.position.z = 4.2;

        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
        });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        container.appendChild(renderer.domElement);

        // Group containing all 3D biometric objects
        const group = new THREE.Group();
        scene.add(group);

        // 1. Geodesic / Biometric Face Mesh (Icosahedron Wireframe + Points)
        const meshGeo = new THREE.IcosahedronGeometry(1.35, 2);
        
        // Lines
        const wireframeGeo = new THREE.WireframeGeometry(meshGeo);
        const lineMat = new THREE.LineBasicMaterial({
            color: 0x38bdf8, // Sky-400
            transparent: true,
            opacity: 0.35,
        });
        const meshLines = new THREE.LineSegments(wireframeGeo, lineMat);
        group.add(meshLines);

        // Vertices as glowing sensor nodes
        const pointsMat = new THREE.PointsMaterial({
            color: 0x06b6d4, // Cyan-500
            size: 0.055,
            transparent: true,
            opacity: 0.85,
        });
        const meshPoints = new THREE.Points(meshGeo, pointsMat);
        group.add(meshPoints);

        // 2. Orbital Targeting Rings (Scanner Reticles)
        const createRing = (radius: number, color: number, opacity: number, rotationSpeed: number) => {
            const ringGeo = new THREE.RingGeometry(radius - 0.008, radius, 64);
            const ringMat = new THREE.MeshBasicMaterial({
                color,
                side: THREE.DoubleSide,
                transparent: true,
                opacity,
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            return { mesh: ring, speed: rotationSpeed };
        };

        const ring1 = createRing(1.65, 0x0284c7, 0.4, 0.005);
        ring1.mesh.rotation.x = Math.PI / 3;
        group.add(ring1.mesh);

        const ring2 = createRing(1.85, 0x10b981, 0.3, -0.003);
        ring2.mesh.rotation.y = Math.PI / 4;
        group.add(ring2.mesh);

        // 3. 128-D Vector Embeddings Point Cloud
        const vectorCount = 128;
        const vectorPositions = new Float32Array(vectorCount * 3);
        const vectorColors = new Float32Array(vectorCount * 3);

        const cyanColor = new THREE.Color(0x06b6d4);
        const emeraldColor = new THREE.Color(0x10b981);

        for (let i = 0; i < vectorCount; i++) {
            const u = Math.random();
            const v = Math.random();
            const theta = u * 2.0 * Math.PI;
            const phi = Math.acos(2.0 * v - 1.0);
            const r = 1.45 + Math.random() * 0.45;

            const sinPhi = Math.sin(phi);
            vectorPositions[i * 3] = r * sinPhi * Math.cos(theta);
            vectorPositions[i * 3 + 1] = r * sinPhi * Math.sin(theta);
            vectorPositions[i * 3 + 2] = r * Math.cos(phi);

            const mixedColor = cyanColor.clone().lerp(emeraldColor, Math.random());
            vectorColors[i * 3] = mixedColor.r;
            vectorColors[i * 3 + 1] = mixedColor.g;
            vectorColors[i * 3 + 2] = mixedColor.b;
        }

        const vectorGeo = new THREE.BufferGeometry();
        vectorGeo.setAttribute('position', new THREE.BufferAttribute(vectorPositions, 3));
        vectorGeo.setAttribute('color', new THREE.BufferAttribute(vectorColors, 3));

        const vectorMat = new THREE.PointsMaterial({
            size: 0.045,
            vertexColors: true,
            transparent: true,
            opacity: 0.75,
        });
        const vectorPoints = new THREE.Points(vectorGeo, vectorMat);
        group.add(vectorPoints);

        // 4. Holographic Scan Laser Ring moving along Y axis
        const scanRingGeo = new THREE.RingGeometry(1.38, 1.41, 64);
        const scanRingMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.7,
        });
        const scanRing = new THREE.Mesh(scanRingGeo, scanRingMat);
        scanRing.rotation.x = Math.PI / 2;
        group.add(scanRing);

        // Mouse Tracking
        let mouseX = 0;
        let mouseY = 0;
        let targetRotX = 0;
        let targetRotY = 0;

        const handleMouseMove = (event: MouseEvent) => {
            if (!interactive) return;
            const rect = container.getBoundingClientRect();
            const x = (event.clientX - rect.left) / rect.width - 0.5;
            const y = (event.clientY - rect.top) / rect.height - 0.5;
            mouseX = x * 2;
            mouseY = y * 2;
        };

        if (interactive) {
            window.addEventListener('mousemove', handleMouseMove);
        }

        // Animation Loop
        let animationFrameId: number;
        let clock = new THREE.Clock();

        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);

            const elapsedTime = clock.getElapsedTime();

            // Self-rotation
            meshLines.rotation.y += 0.003;
            meshPoints.rotation.y += 0.003;
            vectorPoints.rotation.y -= 0.002;
            vectorPoints.rotation.x += 0.001;

            ring1.mesh.rotation.z += ring1.speed;
            ring2.mesh.rotation.x += ring2.speed;

            // Pulsing Scan line (up and down)
            const scanY = Math.sin(elapsedTime * 2.2) * 1.35;
            scanRing.position.y = scanY;
            const scanScale = Math.cos(Math.asin(Math.min(Math.max(scanY / 1.35, -0.99), 0.99))) * 1.02;
            scanRing.scale.set(scanScale, scanScale, 1);

            // Subtle breathing pulse
            const pulse = 1 + Math.sin(elapsedTime * 1.8) * 0.02;
            meshLines.scale.set(pulse, pulse, pulse);
            meshPoints.scale.set(pulse, pulse, pulse);

            // Smooth interactive mouse tilt with damping
            targetRotY = mouseX * 0.55;
            targetRotX = -mouseY * 0.35;

            group.rotation.y += (targetRotY - group.rotation.y) * 0.05;
            group.rotation.x += (targetRotX - group.rotation.x) * 0.05;

            renderer.render(scene, camera);
        };

        animate();

        // Responsive Resize Handler
        const handleResize = () => {
            if (!container) return;
            const newW = container.clientWidth || 400;
            const newH = container.clientHeight || 400;
            camera.aspect = newW / newH;
            camera.updateProjectionMatrix();
            renderer.setSize(newW, newH);
        };

        const resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(container);

        // Cleanup
        return () => {
            if (interactive) {
                window.removeEventListener('mousemove', handleMouseMove);
            }
            resizeObserver.disconnect();
            cancelAnimationFrame(animationFrameId);

            if (renderer.domElement && container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement);
            }

            meshGeo.dispose();
            wireframeGeo.dispose();
            lineMat.dispose();
            pointsMat.dispose();
            ring1.mesh.geometry.dispose();
            (ring1.mesh.material as THREE.Material).dispose();
            ring2.mesh.geometry.dispose();
            (ring2.mesh.material as THREE.Material).dispose();
            vectorGeo.dispose();
            vectorMat.dispose();
            scanRingGeo.dispose();
            scanRingMat.dispose();
            renderer.dispose();
        };
    }, [interactive]);

    return (
        <div
            ref={containerRef}
            className={`relative flex items-center justify-center overflow-hidden select-none ${className}`}
            style={{ touchAction: 'none' }}
        />
    );
}
