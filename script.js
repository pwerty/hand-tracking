import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js";

const video = document.getElementById("webcam");
const canvas = document.getElementById("output_canvas");
const ctx = canvas.getContext("2d");
const threeContainer = document.getElementById("three-container");
const startButton = document.getElementById("startButton");

let handLandmarker;
let scene, camera, renderer, model;
let mixer, animations = [];
let bones = {}; // 본 저장소
let isRunning = false;

// MediaPipe 손 랜드마크 인덱스 정의
const HAND_LANDMARKS = {
    WRIST: 0,
    THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
    INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
    MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
    RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
    PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20
};

// 20 bone mappings between MediaPipe landmarks and Blender bone names
// [startIdx, endIdx] -> boneName
// [0,1] -> thumb_cmc
// [1,2] -> thumb_mcp
// [2,3] -> thumb_ip
// [3,4] -> thumb_tip
// [0,5] -> index_mcp
// [5,6] -> index_pip
// [6,7] -> index_dip
// [7,8] -> index_tip
// [0,9] -> middle_mcp
// [9,10] -> middle_pip
// [10,11] -> middle_dip
// [11,12] -> middle_tip
// [0,13] -> ring_mcp
// [13,14] -> ring_pip
// [14,15] -> ring_dip
// [15,16] -> ring_tip
// [0,17] -> pinky_mcp
// [17,18] -> pinky_pip
// [18,19] -> pinky_dip
// [19,20] -> pinky_tip
const HAND_CONNECTIONS = [
    [0,1],[1,2],[2,3],[3,4],
    [0,5],[5,6],[6,7],[7,8],
    [0,9],[9,10],[10,11],[11,12],
    [0,13],[13,14],[14,15],[15,16],
    [0,17],[17,18],[18,19],[19,20],
  ];
  
  // convert normalized MediaPipe landmark to Three.js world vector
  function landmarkToWorld(lm) {
    return new THREE.Vector3(
      (lm.x * 2) - 1,
      -((lm.y * 2) - 1),
      -lm.z * 2
    );
  }
  
  // derive bone name from landmark pair
  function getBoneName(startIdx, endIdx) {
    const endKey = Object.keys(HAND_LANDMARKS)
      .find(key => HAND_LANDMARKS[key] === endIdx);
    return endKey.toLowerCase();
  }
  

function initThreeJS() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    threeContainer.appendChild(renderer.domElement);
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 5);
    scene.add(directionalLight);
    
    // 애니메이션 믹서 초기화
    mixer = new THREE.AnimationMixer(scene);
    
    loadGLBModel();
    camera.position.z = 2;
}

// GLB 모델 로드 및 본 구조 추출
function loadGLBModel() {
    const loader = new GLTFLoader();
    
    loader.load('./models/newHanda.glb', 
        function(gltf) {
            model = gltf.scene;
            model.scale.set(0.1, 0.1, 0.1);
            model.position.set(0, 0, 0);
            
            // 본 구조 추출
            extractBones(model);
            
            // 애니메이션 클립이 있다면 추가
            if (gltf.animations.length > 0) {
                gltf.animations.forEach((clip) => {
                    const action = mixer.clipAction(clip);
                    animations.push(action);
                });
            }
            
            scene.add(model);
            console.log('GLB 모델 및 본 구조 로드 완료');
            console.log('추출된 본들:', Object.keys(bones));
        },
        undefined,
        function(error) {
            console.error('GLB 로드 실패:', error);
            // 폴백: 기본 손 모델 생성
            createDefaultHandModel();
        }
    );
}

// 본 구조 추출 함수
function extractBones(object) {
  object.traverse((child) => {
      if (child.isBone) {
          // 본 이름을 기반으로 매핑 (실제 GLB 모델의 본 이름에 맞게 수정 필요)
          const boneName = child.name.toLowerCase(); // GLB 모델 본 이름에 맞춰 수동으로 수정할 수 있음
          
          console.log("Extracted bone:", boneName);  // 디버깅: 추출된 본 이름 확인

          // 손목
          if (boneName.includes('wrist')) bones.wrist = child;
          else if (boneName.includes('thumb')) {
              if (boneName.includes('cmc')) bones.thumb_cmc = child;
              else if (boneName.includes('pip')) bones.thumb_pip = child;
              else if (boneName.includes('tip')) bones.thumb_tip = child;
              else if (boneName.includes('ip')) bones.thumb_ip = child;
          }
          else if (boneName.includes('index')) {
              if (boneName.includes('mcp')) bones.index_mcp = child;
              else if (boneName.includes('pip')) bones.index_pip = child;
              else if (boneName.includes('dip')) bones.index_dip = child;
              else if (boneName.includes('tip')) bones.index_tip = child;
          }
          else if (boneName.includes('middle'))
          {
            if (boneName.includes('mcp')) bones.middle_mcp = child;
            else if (boneName.includes('pip')) bones.middle_pip = child;
            else if (boneName.includes('dip')) bones.middle_dip = child;
            else if (boneName.includes('tip')) bones.middle_tip = child;
          }
          else if (boneName.includes('ring'))
          {
            if (boneName.includes('mcp')) bones.ring_mcp = child;
            else if (boneName.includes('pip')) bones.ring_pip = child;
            else if (boneName.includes('dip')) bones.ring_dip = child;
            else if (boneName.includes('tip')) bones.ring_tip = child;
          }
          else if (boneName.includes('pinky'))
          {
            if (boneName.includes('mcp')) bones.pinky_mcp = child;
            else if (boneName.includes('pip')) bones.pinky_pip = child;
            else if (boneName.includes('dip')) bones.pinky_dip = child;
            else if (boneName.includes('tip')) bones.pinky_tip = child;
          }
      }
  });
}

// 기본 손 모델 생성 (GLB 로드 실패시)
function createDefaultHandModel() {
    const handGroup = new THREE.Group();
    
    // 간단한 손가락 모델 생성
    const fingerGeometry = new THREE.CylinderGeometry(0.01, 0.01, 0.1);
    const fingerMaterial = new THREE.MeshPhongMaterial({ color: 0xffdbac });
    
    // 5개 손가락 생성
    for (let i = 0; i < 5; i++) {
        const finger = new THREE.Mesh(fingerGeometry, fingerMaterial);
        finger.position.x = (i - 2) * 0.05;
        finger.name = `finger_${i}`;
        handGroup.add(finger);
    }
    
    model = handGroup;
    scene.add(model);
}

// MediaPipe 랜드마크를 본 회전으로 변환
function applyHandLandmarksToModel(landmarks) {
    if (!landmarks || landmarks.length === 0 || !model) return;
    
    // 손목 위치 업데이트
    const wrist = landmarks[HAND_LANDMARKS.WRIST];
    if (wrist) {
       const x = (wrist.x * 2) - 1;
       const y = -((wrist.y * 2) - 1);
        const z = -wrist.z * 2;
        model.position.set(x, y, z);

            // 2) Palm Normal 계산 (Flip 감지를 위해)
        const I = landmarks[HAND_LANDMARKS.INDEX_MCP];
        const P = landmarks[HAND_LANDMARKS.PINKY_MCP];
        const w = new THREE.Vector3(x, y, z);
        const i = new THREE.Vector3((I.x * 2) - 1, -((I.y * 2) - 1), -I.z * 2);
        const p = new THREE.Vector3((P.x * 2) - 1, -((P.y * 2) - 1), -P.z * 2);
        const palmNormal = new THREE.Vector3()
      .subVectors(i, w)
      .cross(new THREE.Vector3().subVectors(p, w))
      .normalize();
        
        // 손목 회전 적용
        // 반 강제로 손목 고정 적용
        const wristRotation = calculateBoneRotation(new THREE.Vector3(x,y,z), palmNormal);
        bones.wrist.rotation.copy(wristRotation);
    }
    
//     // 각 손가락 본에 회전 적용
//     applyFingerRotation('thumb', [
//         landmarks[HAND_LANDMARKS.THUMB_CMC],
//         landmarks[HAND_LANDMARKS.THUMB_MCP],
//         landmarks[HAND_LANDMARKS.THUMB_IP],
//         landmarks[HAND_LANDMARKS.THUMB_TIP]
//     ]);
    
//     applyFingerRotation('index', [
//         landmarks[HAND_LANDMARKS.INDEX_MCP],
//         landmarks[HAND_LANDMARKS.INDEX_PIP],
//         landmarks[HAND_LANDMARKS.INDEX_DIP],
//         landmarks[HAND_LANDMARKS.INDEX_TIP]
//     ]);

//     applyFingerRotation('middle', [
//       landmarks[HAND_LANDMARKS.MIDDLE_MCP],
//       landmarks[HAND_LANDMARKS.MIDDLE_PIP],
//       landmarks[HAND_LANDMARKS.MIDDLE_DIP],
//       landmarks[HAND_LANDMARKS.MIDDLE_TIP]
//     ]);

//     applyFingerRotation('ring', [
//      landmarks[HAND_LANDMARKS.RING_MCP],
//      landmarks[HAND_LANDMARKS.RING_PIP],
//      landmarks[HAND_LANDMARKS.RING_DIP],
//      landmarks[HAND_LANDMARKS.RING_TIP]
//     ]);

//    applyFingerRotation('pinky', [
//     landmarks[HAND_LANDMARKS.PINKY_MCP],
//     landmarks[HAND_LANDMARKS.PINKY_PIP],
//     landmarks[HAND_LANDMARKS.PINKY_DIP],
//     landmarks[HAND_LANDMARKS.PINKY_TIP]
//     ]);
    
}

// 손가락 회전 계산 및 적용
function applyFingerRotation(fingerName, joints) {
    if (joints.length < 2) return;
  
  for (let i = 0; i < joints.length - 1; i++) {

      const currentJoint = joints[i];
      const nextJoint = joints[i + 1];
      
      if (currentJoint && nextJoint) {
          // 방향 벡터 계산
          // Map normalized landmark coords into world space
          const v1 = new THREE.Vector3(
            (currentJoint.x * 2) - 1,
            -((currentJoint.y * 2) - 1),
            -currentJoint.z * 2
        );
        const v2 = new THREE.Vector3(
            (nextJoint.x * 2) - 1,
            -((nextJoint.y * 2) - 1),
            -nextJoint.z * 2
        );
        const direction = v2.clone().sub(v1).normalize();
          
          // 회전 계산
          const rotation = calculateBoneRotation(direction);
          
          // 정확한 본 이름을 매핑
          let boneName = '';

         if (fingerName === 'index') {
            if (i === 0) boneName = 'index_dip';
            else if (i === 1) boneName = 'index_tip';
         }

        //   if (fingerName === 'thumb') {
        //       if (i === 0) boneName = 'thumb_cmc';
        //       else if (i === 1) boneName = 'thumb_pip';
        //       else if (i === 2) boneName = 'thumb_dip';
        //       else if (i === 3) boneName = 'thumb_tip';
        //   } else if (fingerName === 'index') {
        //       if (i === 0) boneName = 'index_mcp';
        //       else if (i === 1) boneName = 'index_pip';
        //       else if (i === 2) boneName = 'index_dip';
        //       else if (i === 3) boneName = 'index_tip';
        //   } else if (fingerName === 'middle') {
        //       if (i === 0) boneName = 'middle_mcp';
        //       else if (i === 1) boneName = 'middle_pip';
        //       else if (i === 2) boneName = 'middle_dip';
        //       else if (i === 3) boneName = 'middle_tip';
        //   } else if (fingerName === 'ring') {
        //       if (i === 0) boneName = 'ring_mcp';
        //       else if (i === 1) boneName = 'ring_pip';
        //       else if (i === 2) boneName = 'ring_dip';
        //       else if (i === 3) boneName = 'ring_tip';
        //   } else if (fingerName === 'pinky') {
        //       if (i === 0) boneName = 'pinky_mcp';
        //       else if (i === 1) boneName = 'pinky_pip';
        //       else if (i === 2) boneName = 'pinky_dip';
        //       else if (i === 3) boneName = 'pinky_tip';
        //   }
          console.log("bone name : " + boneName);
          
          // 해당 본에 회전 적용
          if (bones[boneName]) {
              bones[boneName].rotation.copy(rotation);
             console.log(`Applied rotation to ${boneName}:`, rotation);
          }
      }
  }
}
// 본 회전 계산 함수
function calculateBoneRotation(direction, palmNormal) {
    // const rotation = new THREE.Euler();
    
    // // 방향 벡터를 기반으로 회전 각도 계산
    // rotation.x = Math.atan2(direction.y, direction.z);
    // rotation.y = Math.atan2(direction.x, direction.z);
    // rotation.z = Math.atan2(direction.x, direction.y);
    
    // return rotation;
    
  // direction: bone이 향해야 할 forward 벡터
  // palmNormal: 손바닥이 향하는 법선 벡터

  const F = direction.clone().normalize();                      // 뼈 길이 축
  const R = new THREE.Vector3().crossVectors(palmNormal, F).normalize();  // right 축
  const U = new THREE.Vector3().crossVectors(F, R).normalize();          // up 축

  // 세 축으로 Basis 행렬 생성
  const basisMat = new THREE.Matrix4().makeBasis(R, F, U);
  // 회전 행렬 → Euler
  return new THREE.Euler().setFromRotationMatrix(basisMat, 'XYZ');

    // Default bone forward axis is +Y in Blender
    const boneAxis = new THREE.Vector3(0, 0.5, 0);
    // Compute quaternion rotating boneAxis to the target direction
    const quaternion = new THREE.Quaternion().setFromUnitVectors(boneAxis, direction.clone().normalize());
    // Convert quaternion to Euler angles (matching the bone’s rotation order)
    const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
    return euler;
}

// 메인 예측 루프 수정
async function predictWebcam() {
    if (!isRunning) return;
    
    const startTimeMs = performance.now();
    const results = await handLandmarker.detectForVideo(video, startTimeMs);
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (results.landmarks && results.landmarks.length > 0) {
        for (const landmarks of results.landmarks) {
            drawHand(landmarks);
            // 스켈레톤 애니메이션 적용
            applyHandLandmarksToModel(landmarks);
        }
    }
    
    // 애니메이션 믹서 업데이트
    if (mixer) {
        mixer.update(0.016); // 60fps 기준
    }
    
    renderer.render(scene, camera);
    requestAnimationFrame(predictWebcam);
}

// 나머지 함수들은 이전과 동일...
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

window.addEventListener('resize', () => {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
});
