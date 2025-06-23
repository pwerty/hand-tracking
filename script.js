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
    
    loader.load('./models/FullFlat.glb', 
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

// Swing & Twist 분리용 헬퍼
function clampTwist(q, twistAxis, maxTwist) {
    // twist 축 방향 성분 추출
    const proj = twistAxis.clone().multiplyScalar(
      twistAxis.dot(new THREE.Vector3(q.x, q.y, q.z))
    );
    let twistQuat = new THREE.Quaternion(proj.x, proj.y, proj.z, q.w).normalize();
    // swing = q * inverse(twist)
    const swingQuat = q.clone().multiply(twistQuat.clone().invert());
    // twist 각도 계산 & 클램프
    let angle = 2 * Math.acos(twistQuat.w);
    if (angle > Math.PI) angle -= 2 * Math.PI;
    angle = THREE.MathUtils.clamp(angle, -maxTwist, maxTwist);
    twistQuat.setFromAxisAngle(twistAxis, angle);
    // swing * twist 반환
    return swingQuat.multiply(twistQuat);
  }
  
  // World 변환 헬퍼
  function lmToWorld(lm) {
    const HAND_SCALE = 1.0;
    return new THREE.Vector3(
      ((lm.x * 2) - 1) * HAND_SCALE,
      -((lm.y * 2) - 1) * HAND_SCALE,
      -lm.z * 2 * HAND_SCALE
    );
  }
  
  // per-finger 연결 맵
  const FINGER_CONNECTIONS = {
    thumb:  [[0,1],[1,2],[2,3],[3,4]],
    index:  [[0,5],[5,6],[6,7],[7,8]],
    middle: [[0,9],[9,10],[10,11],[11,12]],
    ring:   [[0,13],[13,14],[14,15],[15,16]],
    pinky:  [[0,17],[17,18],[18,19],[19,20]],
  };
  

// 개선된 applyHandLandmarksToModel
function applyHandLandmarksToModel(landmarks) {
    if (!landmarks || !model) return;
    const SMOOTHING = 0.2;
    const MAX_TWIST = THREE.MathUtils.degToRad(30);
  
    // 1) 손목 위치 스무딩
    const wristLM = landmarks[HAND_LANDMARKS.WRIST];
    if (wristLM) {
      const wPos = lmToWorld(wristLM);
      model.position.lerp(wPos, SMOOTHING);
    }
  
    // 2) palmNormal 계산 (4 MCP 순환 cross 합산)
    const wPt = lmToWorld(landmarks[0]);
    const mcpIdxs = [
      HAND_LANDMARKS.INDEX_MCP,
      HAND_LANDMARKS.MIDDLE_MCP,
      HAND_LANDMARKS.RING_MCP,
      HAND_LANDMARKS.PINKY_MCP
    ];
    let normalSum = new THREE.Vector3();
    for (let i = 0; i < mcpIdxs.length; i++) {
      const a = lmToWorld(landmarks[mcpIdxs[i]]);
      const b = lmToWorld(landmarks[mcpIdxs[(i+1)%mcpIdxs.length]]);
      normalSum.add(
        new THREE.Vector3().subVectors(a, wPt)
          .cross(new THREE.Vector3().subVectors(b, wPt))
      );
    }
    const palmNormal = normalSum.normalize();
    if (palmNormal.z < 0) palmNormal.negate();
  
    // 3) 손가락별 처리
    for (const [finger, connections] of Object.entries(FINGER_CONNECTIONS)) {
      // finger마다 자신만의 normal: MCP→PIP × MCP→DIP
      // finger마다 자신만의 normal: MCP→PIP × MCP→DIP, thumb은 CMC→MCP × CMC→IP
      let m, p, d;
      if (finger === 'thumb') {
          // Thumb uses CMC, MCP, IP
          m = lmToWorld(landmarks[HAND_LANDMARKS.THUMB_CMC]);
          p = lmToWorld(landmarks[HAND_LANDMARKS.THUMB_MCP]);
          d = lmToWorld(landmarks[HAND_LANDMARKS.THUMB_IP]);
      } else {
          m = lmToWorld(landmarks[HAND_LANDMARKS[finger.toUpperCase() + '_MCP']]);
          p = lmToWorld(landmarks[HAND_LANDMARKS[finger.toUpperCase() + '_PIP']]);
          d = lmToWorld(landmarks[HAND_LANDMARKS[finger.toUpperCase() + '_DIP']]);
      }
      let fNormal = new THREE.Vector3()
        .subVectors(p, m)
        .cross(new THREE.Vector3().subVectors(d, m))
        .normalize();
      if (fNormal.dot(palmNormal) < 0) fNormal.negate();
  
      // 각 본(head→tail)마다 회전 적용
      for (const [s,e] of connections) {
        const lmA = landmarks[s], lmB = landmarks[e];
        if (!lmA || !lmB) continue;
        
        const pA = lmToWorld(lmA);
        const pB = lmToWorld(lmB);
        const dir = pB.clone().sub(pA).normalize();
  
        const boneName = getBoneName(s, e);
        const bone = bones[boneName];
        if (!bone) continue;
  
        // ① bind-pose 축 추출
        const head = new THREE.Vector3(), tail = new THREE.Vector3();
        bone.getWorldPosition(head);
        bone.children[0]?.getWorldPosition(tail) || tail.copy(head).add(dir);
        //const boneAxis = new THREE.Vector3().subVectors(tail, head).normalize();
  

        // ① bind-pose 축 추출
// const boneAxis = new THREE.Vector3().subVectors(tail, head).normalize();
const boneAxis = new THREE.Vector3(0, 1, 0); // 또는 (0,0,1), (1,0,0) 등 실험

// ② raw 회전(quaternion)
const rot1 = new THREE.Quaternion().setFromUnitVectors(boneAxis, dir);

// twist 보정 없이 바로 적용
bone.quaternion.slerp(rot1, SMOOTHING);
        // ② raw 회전(quaternion)
       // const rot1 = new THREE.Quaternion().setFromUnitVectors(boneAxis, dir);
        // ③ twist 보정
       // const bindUp = new THREE.Vector3(0,1,0).applyQuaternion(rot1);
        //const bindUp = new THREE.Vector3(0,1,0).applyQuaternion(rot1);
       // const bindUp = new THREE.Vector3(0,0,0).applyQuaternion(rot1);
      //  const rot2 = new THREE.Quaternion().setFromUnitVectors(bindUp, fNormal);
       // const rawQuat = rot2.multiply(rot1);
  
        // ④ twist 클램프 + 스무딩
      //  const safeQuat = clampTwist(rawQuat, boneAxis, MAX_TWIST);
        //bone.quaternion.slerp(rot1, SMOOTHING);
      }
    }
  }

// // MediaPipe 랜드마크를 본 회전으로 변환
// function applyHandLandmarksToModel(landmarks)
// {
//     if (!landmarks || landmarks.length === 0 || !model) return;
//     // smoothing factor: 0 = no smoothing, 1 = freeze
//     const SMOOTHING = 0.5;

//     // 1) Update hand root (optional, keep model at wrist)
//     const wristLM = landmarks[HAND_LANDMARKS.WRIST];
//     if (wristLM) {
//       const wristPos = landmarkToWorld(wristLM);
//       model.position.lerp(wristPos, SMOOTHING);
//     }

//     // 2) Compute palm normal using four MCP landmarks
//     const wristPt = landmarkToWorld(landmarks[HAND_LANDMARKS.WRIST]);
//     const mcpIndices = [
//       HAND_LANDMARKS.INDEX_MCP,
//       HAND_LANDMARKS.MIDDLE_MCP,
//       HAND_LANDMARKS.RING_MCP,
//       HAND_LANDMARKS.PINKY_MCP
//     ];
//     let normalSum = new THREE.Vector3();
//     for (let i = 0; i < mcpIndices.length; i++) {
//       const a = landmarkToWorld(landmarks[mcpIndices[i]]);
//       const b = landmarkToWorld(landmarks[mcpIndices[(i + 1) % mcpIndices.length]]);
//       normalSum.add(new THREE.Vector3().subVectors(a, wristPt)
//         .cross(new THREE.Vector3().subVectors(b, wristPt)));
//     }
//     const palmNormal = normalSum.normalize();
//     if (palmNormal.z < 0) palmNormal.negate();

//       // 3) Loop through all bone connections
//     for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
//         const aLM = landmarks[startIdx], bLM = landmarks[endIdx];
//         if (!aLM || !bLM) continue;

//     const pA = landmarkToWorld(aLM);
//     const pB = landmarkToWorld(bLM);
//     const dir = pB.clone().sub(pA).normalize();
//     const boneName = getBoneName(startIdx, endIdx);
//     const bone = bones[boneName];
//     if (!bone) continue;

//     // optionally snap head position
//    // bone.position.copy(pA);
//     // apply quaternion rotation
//     const quat = calculateBoneQuaternion(dir, palmNormal, bone);
//     bone.quaternion.copy(quat);
    
// }
// }


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
         // const rotation = calculateBoneRotation(direction);
          
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

/**
 * direction   : bone이 향해야 할 forward 벡터 (Three.js world space)
 * palmNormal  : 손바닥 평면의 법선 벡터 (Three.js world space)
 * bone        : Three.Bone 객체 (bind pose 기준으로 계산)
 * 반환        : bone에 바로 적용할 수 있는 Quaternion
 */
function calculateBoneQuaternion(direction, palmNormal, bone) {
    // 1) bone bind‐pose forward axis 추출
    const headPos = new THREE.Vector3();
    const tailPos = new THREE.Vector3();
    bone.getWorldPosition(headPos);
    if (bone.children.length && bone.children[0].isBone) {
      bone.children[0].getWorldPosition(tailPos);
    } else {
      tailPos.copy(headPos).add(direction);
    }
    const boneAxis = tailPos.clone().sub(headPos).normalize();
  
    // 2) boneAxis → target forward direction 회전 quaternion
    const targetDir = direction.clone().normalize();
    const rotToDir = new THREE.Quaternion().setFromUnitVectors(boneAxis, targetDir);
  
    // 3) twist 보정: 회전된 Up벡터 → palmNormal
    //    Up벡터 기준은 world Y(0,1,0) 또는 bind‐pose Up축(필요시 커스터마이즈)
    const bindUp = new THREE.Vector3(0, 1, 0).applyQuaternion(rotToDir);
    const twistQuat = new THREE.Quaternion().setFromUnitVectors(
      bindUp, 
      palmNormal.clone().normalize()
    );
  
    // 4) 두 회전 결합
    return twistQuat.multiply(rotToDir);
  }


// 메인 예측 루프 수정
async function predictWebcam() {
    if (!isRunning) return;
    
    const startTimeMs = performance.now();
    const results = await handLandmarker.detectForVideo(video, startTimeMs);
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (results.landmarks && results.landmarks.length > 0) {
        for (const landmarks of results.landmarks) {
            // 빨간 점과 초록 선으로 이루어진 가상 선을 그립니다. 
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
        [0,17], [13,17], [17,18], [18,19], [19,20]
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
