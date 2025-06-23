// 기존 문제있던 임포트
// import * as THREE from 'https://cdn.jsdelivr.net/npm/three@latest/build/three.module.js';

// 수정된 CDN 임포트
import * as THREE from 'https://unpkg.com/three@0.170.0/build/three.module.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.170.0/examples/jsm/loaders/GLTFLoader.js';

// MediaPipe도 안정적인 버전으로 변경
import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js";

const video = document.getElementById("webcam");
const canvas = document.getElementById("output_canvas");
const ctx = canvas.getContext("2d");
const threeContainer = document.getElementById("three-container");
const startButton = document.getElementById("startButton");

let handLandmarker;
let scene, camera, renderer, model;
let isRunning = false;

// Three.js 초기화
function initThreeJS() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    threeContainer.appendChild(renderer.domElement);
    
    // 조명 추가
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 5);
    scene.add(directionalLight);
    
    // 기본 큐브 생성
    const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const material = new THREE.MeshPhongMaterial({ color: 0x00ff00 });
    model = new THREE.Mesh(geometry, material);
    scene.add(model);
    
    camera.position.z = 2;
}

// MediaPipe 초기화
async function initializeHandLandmarker() {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );
    
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
        },
        runningMode: "LIVE",
        numHands: 2
    });
}

// 웹캠 시작
async function startWebcam() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 1280, height: 720 } 
        });
        video.srcObject = stream;
        
        video.addEventListener('loadedmetadata', () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        });
        
        return new Promise((resolve) => {
            video.addEventListener('loadeddata', resolve);
        });
    } catch (error) {
        console.error('웹캠 접근 실패:', error);
    }
}

// 손 위치에 따라 3D 모델 업데이트
function updateModelPosition(landmarks) {
    if (landmarks && landmarks.length > 0) {
        const wrist = landmarks[0];
        
        const x = (wrist.x * 2) - 1;
        const y = -((wrist.y * 2) - 1);
        const z = -wrist.z * 2;
        
        model.position.set(x, y, z);
        
        if (landmarks.length > 8) {
            const indexTip = landmarks[8];
            const rotationY = (indexTip.x - 0.5) * Math.PI;
            model.rotation.y = rotationY;
        }
    }
}

// 메인 예측 루프
async function predictWebcam() {
    if (!isRunning) return;
    
    const startTimeMs = performance.now();
    const results = await handLandmarker.detectForVideo(video, startTimeMs);
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (results.landmarks && results.landmarks.length > 0) {
        for (const landmarks of results.landmarks) {
            drawHand(landmarks);
            updateModelPosition(landmarks);
        }
    }
    
    renderer.render(scene, camera);
    requestAnimationFrame(predictWebcam);
}

// 손 그리기
function drawHand(landmarks) {
    const connections = [
        [0,1], [1,2], [2,3], [3,4],
        [0,5], [5,6], [6,7], [7,8],
        [5,9], [9,10], [10,11], [11,12],
        [9,13], [13,14], [14,15], [15,16],
        [13,17], [17,18], [18,19], [19,20], [0,17]
    ];
    
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 2;
    ctx.fillStyle = '#FF0000';
    
    ctx.beginPath();
    for (const [start, end] of connections) {
        const startPoint = landmarks[start];
        const endPoint = landmarks[end];
        
        ctx.moveTo(startPoint.x * canvas.width, startPoint.y * canvas.height);
        ctx.lineTo(endPoint.x * canvas.width, endPoint.y * canvas.height);
    }
    ctx.stroke();
    
    for (const landmark of landmarks) {
        ctx.beginPath();
        ctx.arc(
            landmark.x * canvas.width,
            landmark.y * canvas.height,
            5, 0, 2 * Math.PI
        );
        ctx.fill();
    }
}

// 시작 버튼 이벤트
startButton.addEventListener('click', async () => {
    if (!isRunning) {
        startButton.textContent = '로딩 중...';
        startButton.disabled = true;
        
        try {
            await initializeHandLandmarker();
            await startWebcam();
            initThreeJS();
            
            isRunning = true;
            startButton.textContent = '중지';
            startButton.disabled = false;
            
            predictWebcam();
        } catch (error) {
            console.error('초기화 실패:', error);
            startButton.textContent = '시작하기';
            startButton.disabled = false;
        }
    } else {
        isRunning = false;
        startButton.textContent = '시작하기';
    }
});

// 윈도우 리사이즈 처리
window.addEventListener('resize', () => {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
});
