import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class CharacterController {
  constructor(scene, modelPath, Ammo, physicsWorld, gameScene) {
    this.scene = scene;
    this.modelPath = modelPath;
    this.Ammo = Ammo;
    this.physicsWorld = physicsWorld;
    this.gameScene = gameScene; // ← GameSceneへの参照を保持
    this.physicsBody = null;
    this.characterRadius = 0.3;
    this.characterHeight = 1.0;
    this.characterHalfHeightOffset = this.characterHeight / 2 + this.characterRadius;
    this.characterModel = null;
    this.mixer = null;
    this.animationsMap = null;
    this.currentActionName = '';
    this.moveSpeed = 4;
    this.gravity = 9.8 * 2;
    this.jumpVelocity = 9.0;
    this.velocityY = 0;
    this.isGrounded = false;
    this.downDirection = new THREE.Vector3(0, -1, 0);
    this.keys = {
      w: false, a: false, s: false, d: false,
      ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false,
      shift: false,
      space: false
    };
    this.raycaster = new THREE.Raycaster();
    this.ground = null;
    this.camera = null; // カメラへの参照を追加
    
        // --- ▼ ビームパラメータを追加 ▼ ---
        this.beamRadius = 0.10; // ビームの太さ（半径）
        this.beamLength = 3.5;  // ビームの長さ
        this.beamColor = 0xFFFF4D; // ビームの色 (シアン)
        this.beamSpeed = 20.0;  // ビームの移動速度
        this.beamLifetime = 1.0; // ビームの寿命 (秒)
        this.beamOffsetY = 1.2; // キャラクターの中心からのY軸オフセット
        this.beamOffsetZ = 1.5; // キャラクターの前方へのオフセット
        // --- ▲ ビームパラメータを追加 ▲ ---    
    
        // --- ▼ 輪エフェクトのパラメータを追加 ▼ ---
        this.ringRadius = 0.7;        // 輪の半径
        this.ringTubeRadius = 0.02;   // 輪のチューブの太さ（Torusの場合）
        this.ringColor = 0xFFD84F;    // 輪の色 (白)
        this.ringLifetime = 0.4;      // 輪の表示時間 (秒)

        // --- ▲ 輪エフェクトのパラメータを追加 ▲ ---    
    
  }

  setCamera(camera) {
    this.camera = camera;
  }

  createPhysicsBody() {
    const shape = new this.Ammo.btCapsuleShape(this.characterRadius, this.characterHeight);
    const transform = new this.Ammo.btTransform();
    transform.setIdentity();
    transform.setOrigin(new this.Ammo.btVector3(
      this.characterModel.position.x,
      this.characterModel.position.y + this.characterHalfHeightOffset,
      this.characterModel.position.z
    ));
    transform.setRotation(new this.Ammo.btQuaternion(0, 0, 0, 1));
    const mass = 0;
    const localInertia = new this.Ammo.btVector3(0, 0, 0);
    const motionState = new this.Ammo.btDefaultMotionState(transform);
    const rbInfo = new this.Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia);
    this.physicsBody = new this.Ammo.btRigidBody(rbInfo);
    this.physicsBody.setCollisionFlags(this.physicsBody.getCollisionFlags() | 2);
    this.physicsBody.setActivationState(4);
    this.physicsBody.setAngularFactor(new this.Ammo.btVector3(0, 1, 0));
    this.physicsWorld.addRigidBody(this.physicsBody);
    console.log("Character kinematic physics body created.");
  }

  loadModel() {
    const loader = new GLTFLoader();
    loader.load(
      this.modelPath,
      (gltf) => {
        this.characterModel = gltf.scene;
        this.characterModel.scale.set(0.5, 0.5, 0.5);
        this.characterModel.position.y = 0;
        this.characterModel.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
          }
        });
        this.scene.add(this.characterModel);
        this.mixer = new THREE.AnimationMixer(this.characterModel);
        this.createPhysicsBody();
        this.setupKeyboardControls();
        console.log('Character model loaded and physics body created.');
        this.animationsMap = new Map();
        console.log('利用可能なアニメーション:', gltf.animations.map(clip => clip.name));
        gltf.animations.forEach((clip) => {
          this.animationsMap.set(clip.name, this.mixer.clipAction(clip));
        });
        const idleAction = this.animationsMap.get('Idle');
        if (idleAction) {
          idleAction.play();
          this.currentActionName = 'Idle';
        } else if (this.animationsMap.size > 0) {
          const firstAction = this.animationsMap.values().next().value;
          firstAction.play();
          this.currentActionName = gltf.animations[0].name;
        }
        console.log('キャラクターモデル読み込み完了');
      },
      undefined,
      (error) => {
        console.error('モデルの読み込みエラー:', error);
      }
    );
  }

  setupKeyboardControls() {
    document.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      const key = event.key;
      const code = event.code;
      if (key === 'p' || key === 'P') {
        if (this.currentActionName !== 'Punch' && this.currentActionName !== 'Dance' && this.isGrounded) {
          this.fadeToAction('Punch', 0.2);
                    // --- ▼ パンチ時にビーム発射処理を呼び出す ▼ ---
                    this.fireBeam();
                    // --- ▲ パンチ時にビーム発射処理を呼び出す ▲ --- 
                }
        return;
      }
      if (key === 'o' || key === 'O') {
        if (this.currentActionName !== 'Dance' && this.currentActionName !== 'Punch' && this.isGrounded) {
          this.fadeToAction('Dance', 0.2);
        }
        return;
      }
      if (code === 'Space') {
        this.keys.space = true;
      } else if (this.keys.hasOwnProperty(key.toLowerCase())) {
        this.keys[key.toLowerCase()] = true;
      } else if (this.keys.hasOwnProperty(key)) {
        this.keys[key] = true;
      }
    });


    document.addEventListener('keyup', (event) => {
      const key = event.key;
      const code = event.code;
      if (code === 'Space') {
        this.keys.space = false;
      } else if (this.keys.hasOwnProperty(key.toLowerCase())) {
        this.keys[key.toLowerCase()] = false;
      } else if (this.keys.hasOwnProperty(key)) {
        this.keys[key] = false;
      }
    });
  }

    // --- ▼ ビーム発射メソッドを追加 ▼ ---
    fireBeam() {
        if (!this.characterModel || !this.gameScene) return;

        // 1. 発射方向 (キャラクターの前方)
        const direction = new THREE.Vector3();
        this.characterModel.getWorldDirection(direction); // ワールド座標での向きを取得
        direction.normalize(); //念のため正規化

        // 2. 発射位置 (キャラクターの少し前、少し上)
        const startPosition = this.characterModel.position.clone();
        // Y軸オフセット
        startPosition.y += this.beamOffsetY;
        // 前方へのオフセット
        startPosition.addScaledVector(direction, this.beamOffsetZ);



        // --- ▼ 輪エフェクトの生成 ▼ ---
        try {
            const ringGeometry = new THREE.TorusGeometry(
                this.ringRadius,
                this.ringTubeRadius,
                8, // radialSegments (輪の分割数) - 少なくてOK
                32 // tubularSegments (チューブの分割数)
            );
            const ringMaterial = new THREE.MeshBasicMaterial({
                color: this.ringColor,
                transparent: true,
                opacity: 0.9, // 初期不透明度
                side: THREE.DoubleSide
            });
            const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);

            // 位置をビーム発射位置に設定
            ringMesh.position.copy(startPosition);

            // 輪がキャラクターの前方を向くように設定 (キャラクターの向きに合わせる)
            ringMesh.quaternion.copy(this.characterModel.quaternion);
            // または lookAt を使う場合 (TorusはXY平面基準なので調整が必要かも)
            // const ringTarget = startPosition.clone().add(direction);
            // ringMesh.lookAt(ringTarget); // これだけだと向きが違う可能性

            // ユーザーデータに寿命と初期寿命を保存 (フェードアウト用)
            ringMesh.userData.lifetime = this.ringLifetime;
            ringMesh.userData.initialLifetime = this.ringLifetime; // 初期値も保存

            // GameSceneに輪を追加するよう依頼
            this.gameScene.addRing(ringMesh);
             console.log("Ring created and added"); // ★ デバッグ用ログ
        } catch (error) {
            console.error("Error creating ring effect:", error); // ★ エラーキャッチ
        }
        // --- ▲ 輪エフェクトの生成 ▲ ---









        // 3. ビームのジオメトリとマテリアル
        //    円柱(半径, 半径, 長さ, 円周分割数) - 長さ方向に伸びる
        const beamGeometry = new THREE.CylinderGeometry(
            this.beamRadius,
            this.beamRadius,
            this.beamLength,
            8 // 分割数は少なめでOK
        );
        // 発光マテリアル
        const beamMaterial = new THREE.MeshBasicMaterial({
            color: this.beamColor,
            // emissive: this.beamColor, // MeshBasicMaterial では color だけで発光っぽく見える
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide // 念のため両面描画
        });

        // 4. ビームメッシュの作成と設定
        const beamMesh = new THREE.Mesh(beamGeometry, beamMaterial);
        beamMesh.position.copy(startPosition);

        // ビームを進行方向に向ける
        // ( Cylender はデフォルトでY軸方向に伸びるので、X軸を90度回転させてから向きを合わせる )
        const targetPosition = startPosition.clone().add(direction); // 少し先の点を計算
        beamMesh.lookAt(targetPosition);
        beamMesh.rotateX(Math.PI / 2); // Cylinder を水平にするための補正回転

        // 5. ユーザーデータに速度と寿命を保存
        beamMesh.userData.velocity = direction.clone().multiplyScalar(this.beamSpeed);
        beamMesh.userData.lifetime = this.beamLifetime;

        // 6. GameSceneにビームを追加するよう依頼
        this.gameScene.addBeam(beamMesh);

        // 7. 効果音再生を依頼
        this.gameScene.playBeamSound();
    }
    // --- ▲ ビーム発射メソッドを追加 ▲ ---





  update(delta) {
    if (this.mixer) {
      this.mixer.update(delta);
    }
    if (this.characterModel && this.animationsMap && this.animationsMap.size > 0) {
      this.updateCharacter(delta);
    }
  }

  updateCharacter(delta) {
    if (!this.camera) {
      console.warn('カメラが設定されていません');
      return;
    }

    // カメラの向きに基づいた移動方向を計算
    const moveDirection = new THREE.Vector3(0, 0, 0);
    let targetAnimation = 'Idle';
    
    if (this.physicsBody && this.characterModel) {
      const motionState = this.physicsBody.getMotionState();
      if (motionState) {
        const transform = new this.Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new this.Ammo.btVector3(
          this.characterModel.position.x,
          this.characterModel.position.y + this.characterHalfHeightOffset,
          this.characterModel.position.z
        ));
        const q = this.characterModel.quaternion;
        transform.setRotation(new this.Ammo.btQuaternion(q.x, q.y, q.z, q.w));
        motionState.setWorldTransform(transform);
        this.Ammo.destroy(transform);
        this.physicsBody.activate();
      }
    }

    let wasGrounded = this.isGrounded;
    this.isGrounded = this.characterModel.position.y < 0.01;
    if (this.isGrounded && this.velocityY < 0) {
      this.velocityY = 0;
      this.characterModel.position.y = 0;
    }

    if (this.keys.space && this.isGrounded && this.currentActionName !== 'Punch' && this.currentActionName !== 'Dance') {
      this.velocityY = this.jumpVelocity;
      this.isGrounded = false;
      this.fadeToAction('Jump', 0.1);
    }

    // 入力に基づく移動ベクトルを計算 (カメラ空間での移動)
    const cameraDirection = new THREE.Vector3();
    const cameraInput = new THREE.Vector3(0, 0, 0);

    if (this.currentActionName !== 'Punch' && this.currentActionName !== 'Dance') {
      if (this.keys.w || this.keys.ArrowUp) cameraInput.z -= 1;
      if (this.keys.s || this.keys.ArrowDown) cameraInput.z += 1;
      if (this.keys.a || this.keys.ArrowLeft) cameraInput.x -= 1;
      if (this.keys.d || this.keys.ArrowRight) cameraInput.x += 1;
    }

    if (cameraInput.lengthSq() > 0) {
      cameraInput.normalize();

      // カメラの向きを取得
      this.camera.getWorldDirection(cameraDirection);
      cameraDirection.y = 0; // Y軸回転のみを考慮
      cameraDirection.normalize();

      // カメラの右方向を計算
     const cameraRight = new THREE.Vector3().crossVectors(
         cameraDirection,            // Camera Forward (XZ plane) ★こちらを先に
         new THREE.Vector3(0, 1, 0)  // World Up ★こちらを後に
     ).normalize();

      // 入力をカメラ空間からワールド空間に変換
      moveDirection.addScaledVector(cameraDirection, -cameraInput.z);
      moveDirection.addScaledVector(cameraRight, cameraInput.x);
      moveDirection.normalize();

      // キャラクターの向きを移動方向に合わせて調整
      if (moveDirection.lengthSq() > 0) {
        const targetAngle = Math.atan2(moveDirection.x, moveDirection.z);
        const targetQuaternion = new THREE.Quaternion();
        targetQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetAngle);
        this.characterModel.quaternion.slerp(targetQuaternion, 0.1);
        
        const moveDistance = this.moveSpeed * delta;
        this.characterModel.position.add(moveDirection.clone().multiplyScalar(moveDistance));
      }
    }

    if (!this.isGrounded) {
      this.velocityY -= this.gravity * delta;
      this.characterModel.position.y += this.velocityY * delta;
      if (this.characterModel.position.y < 0) {
        this.characterModel.position.y = 0;
        this.velocityY = 0;
        this.isGrounded = true;
      }
    }

    if (this.currentActionName !== 'Punch' && this.currentActionName !== 'Dance') {
      if (!this.isGrounded) {
        targetAnimation = 'Jump';
      } else {
        if (moveDirection.lengthSq() > 0) {
          targetAnimation = 'Running';
        } else {
          targetAnimation = 'Idle';
        }
      }

      const jumpAction = this.animationsMap.get('Jump');
      const jumpActionRunningOrScheduled = jumpAction && (jumpAction.isRunning() || this.mixer.existingAction(jumpAction));
      
      if (this.currentActionName !== targetAnimation) {
        if (!jumpActionRunningOrScheduled || (this.isGrounded && wasGrounded !== this.isGrounded)) {
          this.fadeToAction(targetAnimation, 0.2);
        }
      }
    }
  }

  fadeToAction(name, duration) {
    const nextAction = this.animationsMap.get(name);
    if (!nextAction) {
      console.warn(`アニメーション "${name}" が見つかりません`);
      return;
    }

    const previousAction = this.currentActionName ? this.animationsMap.get(this.currentActionName) : null;
    
    const onFinished = (event) => {
      if (event.action === nextAction) {
        this.mixer.removeEventListener('finished', onFinished);
        if (this.currentActionName === name) {
          this.fadeToAction('Idle', 0.2);
        }
      }
    };

    if (previousAction && previousAction !== nextAction) {
      this.mixer.removeEventListener('finished', onFinished);
      previousAction.fadeOut(duration);
    }

    nextAction
      .reset()
      .setEffectiveTimeScale(1)
      .setEffectiveWeight(1)
      .fadeIn(duration)
      .play();
      
    this.currentActionName = name;
    nextAction.setLoop(THREE.LoopRepeat);
    nextAction.clampWhenFinished = false;
    nextAction.stopFading();

    if (name === 'Jump' || name === 'Punch' || name === 'Dance') {
      nextAction.setLoop(THREE.LoopOnce);
      nextAction.clampWhenFinished = true;
      this.mixer.addEventListener('finished', onFinished);
    }
    
    this.currentActionName = name;
  }

  setGround(ground) {
    this.ground = ground;
  }
}

class GameScene {
  constructor(AmmoLib) {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.clock = null;
    this.ground = null;
    this.controls = null;
    this.Ammo = AmmoLib;
    this.physicsWorld = null;
    this.rigidBodies = [];
        // --- ▼ 輪の管理用配列を追加 ▼ ---
        this.activeRings = [];
        // --- ▲ 輪の管理用配列を追加 ▲ ---

        // --- ▼ 破片管理用配列を追加 ▼ ---
        this.activeFragments = [];
        // --- ▲ 破片管理用配列を追加 ▲ ---




    this.tempTransform = new this.Ammo.btTransform();
    this.cameraOffset = new THREE.Vector3(0, 2.5, 5.0);
    this.targetCameraPosition = new THREE.Vector3();
    this.targetLookAt = new THREE.Vector3();
    this.modelPath = 'https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb';
    this.characterController = null;
    this.initialCameraPosition = new THREE.Vector3(0, 5, 10);
    this.initialCameraTarget = new THREE.Vector3(0, 1.2, 0);
    this.cameraFollowMode = true; // カメラフォローモードの追加
    
    // --- ▼ オーディオ関連プロパティを追加 ▼ ---
    this.audioListener = null;
    this.audioLoader = null;
    this.beamSound = null;
    // --- ▼ ビーム管理用配列を追加 ▼ ---
    this.activeBeams = [];

        // --- ▼ 破片用のジオメトリとマテリアル (使い回す) ▼ ---
        this.fragmentGeometry = new THREE.BoxGeometry(0.2, 0.2, 0.2); // 小さな立方体
        this.fragmentMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa }); // 破片の色
        // --- ▲ 破片用のジオメトリとマテリアル ▲ ---





    
  }

  init() {
    this.initPhysics();
    this.clock = new THREE.Clock();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 10, 50);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    document.body.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.copy(this.initialCameraPosition);
    this.camera.lookAt(0, 1, 0);
    
    // --- ▼ オーディオ初期化を追加 ▼ ---
    this.audioListener = new THREE.AudioListener();
    this.camera.add(this.audioListener); // カメラにリスナーを追加
    this.audioLoader = new THREE.AudioLoader();
    this.beamSound = new THREE.Audio(this.audioListener); // Audioオブジェクト作成
    // 効果音ファイルをロードしてバッファをセット
    this.audioLoader.load(
        'bgm/beam_01.mp3', // ★★★ ファイルパスを確認してください ★★★
        (buffer) => {
            this.beamSound.setBuffer(buffer);
            this.beamSound.setLoop(false); // ループしない
            this.beamSound.setVolume(0.5); // 音量設定 (0から1)
            console.log('Beam sound loaded.');
        },
        undefined, // onProgress callback not needed
        (err) => {
            console.error('Error loading beam sound:', err);
        }
    );
    
    this.setupLights();
    this.createGround();
    this.createGrid();
    this.createCylinders();
    this.characterController = new CharacterController(
      this.scene,
      this.modelPath,
      this.Ammo,
      this.physicsWorld,
      this
    );
    this.characterController.setGround(this.ground);
    this.characterController.setCamera(this.camera); // カメラを設定
    this.characterController.loadModel();
    window.addEventListener('resize', () => this.onWindowResize());
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 15;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.target.copy(this.initialCameraTarget);
    this.controls.update();
    this.setupSceneControls();
    this.animate();

        // ★ createCylinders で isDestroyed フラグを追加するようにする ★
        this.createCylinders();





  }

    // --- ▼ 効果音再生メソッドを追加 ▼ ---
    playBeamSound() {
        if (this.beamSound && this.beamSound.buffer) {
            // 再生中なら一度止めてから再生（連打対策）
            if (this.beamSound.isPlaying) {
                this.beamSound.stop();
            }
            this.beamSound.play();
        } else {
            console.warn('Beam sound is not ready or loaded.');
        }
    }
    // --- ▲ 効果音再生メソッドを追加 ▲ ---

    // --- ▼ ビームを管理配列に追加するメソッド ▼ ---
    addBeam(beamMesh) {
        this.activeBeams.push(beamMesh);
        this.scene.add(beamMesh); // シーンにも追加
    }
    // --- ▲ ビームを管理配列に追加するメソッド ▲ ---



    // --- ▼ 輪を管理配列に追加するメソッド ▼ ---
    addRing(ringMesh) {
        this.activeRings.push(ringMesh);
        this.scene.add(ringMesh); // シーンにも追加
    }
    // --- ▲ 輪を管理配列に追加するメソッド ▲ ---




  initPhysics() {
    const collisionConfiguration = new this.Ammo.btDefaultCollisionConfiguration();
    const dispatcher = new this.Ammo.btCollisionDispatcher(collisionConfiguration);
    const broadphase = new this.Ammo.btDbvtBroadphase();
    const solver = new this.Ammo.btSequentialImpulseConstraintSolver();
    this.physicsWorld = new this.Ammo.btDiscreteDynamicsWorld(dispatcher, broadphase, solver, collisionConfiguration);
    this.physicsWorld.setGravity(new this.Ammo.btVector3(0, -9.8 * 2, 0));
    console.log("Physics world created with gravity.");
  }

  setupLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7.5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    this.scene.add(directionalLight);
  }

  createGround() {
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x777777, side: THREE.DoubleSide });
    this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    const groundShape = new this.Ammo.btStaticPlaneShape(new this.Ammo.btVector3(0, 1, 0), 0);
    const transform = new this.Ammo.btTransform();
    transform.setIdentity();
    transform.setOrigin(new this.Ammo.btVector3(0, 0, 0));
    const mass = 0;
    const localInertia = new this.Ammo.btVector3(0, 0, 0);
    const motionState = new this.Ammo.btDefaultMotionState(transform);
    const rbInfo = new this.Ammo.btRigidBodyConstructionInfo(mass, motionState, groundShape, localInertia);
    const groundBody = new this.Ammo.btRigidBody(rbInfo);
    groundBody.setFriction(0.5);
    this.physicsWorld.addRigidBody(groundBody);
    console.log("Ground physics body created.");
  }

  createGrid() {
    const gridSize = 100;
    const gridDivisions = 50;
    const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0xffffff, 0xffffff);
    gridHelper.material.opacity = 0.3;
    gridHelper.material.transparent = true;
    this.scene.add(gridHelper);
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

 createCylinders() {
     // --- ▼ 円柱の数をランダムに決定 (7から12個) ▼ ---
     const minCount = 7;
     const maxCount = 12;
     const cylinderCount = Math.floor(Math.random() * (maxCount - minCount + 1)) + minCount;
     console.log(`Creating ${cylinderCount} random cylinders...`); // 生成数をログ表示
     // --- ▲ 円柱の数をランダムに決定 ▲ ---

     // --- ▼ パラメータのランダム範囲を定義 ▼ ---
     const minRadius = 0.2;    // 円柱の最小半径
     const maxRadius = 1.2;    // 円柱の最大半径
     const minHeight = 1.0;    // 円柱の最小の高さ
     const maxHeight = 5.0;    // 円柱の最大の高さ
     const placementRange = 20; // 配置範囲（X, Z座標の広がり +/- 10）
     // --- ▲ パラメータのランダム範囲を定義 ▲ ---

     // --- ▼ 指定した数だけループし、ループ内でパラメータをランダム生成 ▼ ---
     for (let i = 0; i < cylinderCount; i++) { // ループ回数をランダムな数に変更

         // ★ ランダムなパラメータを生成 ★
         const radius = Math.random() * (maxRadius - minRadius) + minRadius; // 範囲内のランダムな半径
         const height = Math.random() * (maxHeight - minHeight) + minHeight; // 範囲内のランダムな高さ
         const color = new THREE.Color(Math.random() * 0xffffff); // ランダムなRGB色を生成

         // --- ▼ 以降は生成したランダム値を使ってオブジェクトを作成 --- ▼
         const geometry = new THREE.CylinderGeometry(radius, radius, height, 32); // ランダムな半径と高さを使用
         const material = new THREE.MeshStandardMaterial({ color: color }); // ランダムな色を使用
         const cylinderMesh = new THREE.Mesh(geometry, material);

         // ランダムな位置に配置 (ここは変更なし)
         const posX = THREE.MathUtils.randFloatSpread(placementRange);
         const posZ = THREE.MathUtils.randFloatSpread(placementRange);
         const posY = height / 2; // 高さに応じてY座標を決定

         cylinderMesh.position.set(posX, posY, posZ);
         cylinderMesh.castShadow = true;
         cylinderMesh.receiveShadow = true;
         this.scene.add(cylinderMesh);


            // ★★★ userData に状態フラグを追加 ★★★
            cylinderMesh.userData.isDestroyed = false; // 破壊状態フラグ
            cylinderMesh.userData.radius = radius; // 衝突判定用に半径も保存
            cylinderMesh.userData.height = height; // （必要なら高さも）


         // 物理ボディの作成 (ランダムな値を使用)
         const cylinderShape = new this.Ammo.btCylinderShape(new this.Ammo.btVector3(radius, height / 2, radius));
         const transform = new this.Ammo.btTransform();
         transform.setIdentity();
         transform.setOrigin(new this.Ammo.btVector3(posX, posY, posZ));
         // 質量は固定でも良いですが、サイズに応じて変化させても面白いかもしれません
         // 例: const mass = Math.PI * radius * radius * height * density; (densityは密度)
         const mass = 5; // ここでは質量は5で固定
         const localInertia = new this.Ammo.btVector3(0, 0, 0);
         cylinderShape.calculateLocalInertia(mass, localInertia);
         const motionState = new this.Ammo.btDefaultMotionState(transform);
         const rbInfo = new this.Ammo.btRigidBodyConstructionInfo(mass, motionState, cylinderShape, localInertia);
         const cylinderBody = new this.Ammo.btRigidBody(rbInfo);
         cylinderBody.setFriction(0.4);
         this.physicsWorld.addRigidBody(cylinderBody);
         cylinderMesh.userData.physicsBody = cylinderBody;
         this.rigidBodies.push(cylinderMesh);

         // ★ コンソールログを調整してランダムな値を表示 ★
         console.log(`  Cylinder ${i + 1}: Color=0x${color.getHexString()}, Radius=${radius.toFixed(2)}, Height=${height.toFixed(2)}, Position=(${posX.toFixed(1)}, ${posY.toFixed(1)}, ${posZ.toFixed(1)})`);
     }
     // --- ▲ ループとパラメータ生成の変更 ▲ ---
     console.log("...Finished creating cylinders.");
 }


    // --- ▼ 破片を生成・飛び散らせるメソッド ▼ ---
    createFragments(cylinderMesh) {
        const fragmentCount = 20; // 1つの円柱から生成する破片の数
        const explosionForce = 5; // 破片が飛び散る力の強さ
        const fragmentLifetime = 1.5; // 破片が表示される時間

        const cylinderPos = cylinderMesh.position;
        const cylinderColor = cylinderMesh.material.color; // 元の円柱の色を使う

        for (let i = 0; i < fragmentCount; i++) {
            // 同じジオメトリを使い、マテリアルは色だけ変えて複製
            const fragMaterial = this.fragmentMaterial.clone();
            fragMaterial.color.lerp(cylinderColor, 0.5); // 元の色を少し混ぜる

            const fragment = new THREE.Mesh(this.fragmentGeometry, fragMaterial);

            // 元の円柱の中心付近から開始
            fragment.position.copy(cylinderPos);
            // 少しランダムにずらす
            fragment.position.x += (Math.random() - 0.5) * cylinderMesh.userData.radius * 0.5;
            fragment.position.y += (Math.random() - 0.5) * cylinderMesh.userData.height * 0.5;
            fragment.position.z += (Math.random() - 0.5) * cylinderMesh.userData.radius * 0.5;

            // 飛び散る方向と速度を設定
            const velocity = new THREE.Vector3(
                (Math.random() - 0.5),
                (Math.random() - 0.5), // Y方向にも少し飛び散る
                (Math.random() - 0.5)
            );
            velocity.normalize().multiplyScalar(explosionForce * (Math.random() * 0.5 + 0.5)); // 力をランダムに

            fragment.userData.velocity = velocity;
            fragment.userData.lifetime = fragmentLifetime * (Math.random() * 0.3 + 0.7); // 寿命も少しランダムに
            fragment.userData.angularVelocity = new THREE.Vector3( // ランダムな回転速度
                (Math.random() - 0.5) * 5,
                (Math.random() - 0.5) * 5,
                (Math.random() - 0.5) * 5
            );

            this.activeFragments.push(fragment);
            this.scene.add(fragment);
        }
    }
    // --- ▲ 破片を生成・飛び散らせるメソッド ▲ ---






  setupSceneControls() {
    document.addEventListener('keydown', (event) => {
      if (event.repeat) return;

      // Rキーでカメラリセット
      if (event.key === 'r' || event.key === 'R') {
        console.log("R key pressed - Resetting camera");
        this.resetCamera();
      }

      // Cキーでカメラモード切替の追加
      if (event.key === 'c' || event.key === 'C') {
        this.cameraFollowMode = !this.cameraFollowMode;
        console.log(`Camera follow mode: ${this.cameraFollowMode ? 'ON' : 'OFF'}`);
        
        if (!this.cameraFollowMode) {
          // フォローモードをオフにしたときの挙動
          this.controls.enabled = true;
        }
      }
    });
  }






  resetCamera() {
    if (this.camera && this.controls) {
      this.camera.position.copy(this.initialCameraPosition);
      this.controls.target.copy(this.initialCameraTarget);
      this.controls.update();
      console.log("Camera reset.");
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const delta = this.clock.getDelta();

     const beamBox = new THREE.Box3();
     const cylinderBox = new THREE.Box3();



    
    if (this.characterController) {
      this.characterController.update(delta);
    }
    
    if (this.physicsWorld) {
      this.physicsWorld.stepSimulation(delta, 10);
    }

     // --- ▼▼▼ ここから追加/変更 ▼▼▼ ---

     // ★★★ 1. 衝突判定ループ (新規追加) ★★★
     // すべてのビームについて処理
     for (const beam of this.activeBeams) {
         // 円柱だけを抽出 (rigidBodies から cylinderMesh のみ)
         // filter を使うか、ループ内でタイプチェックする

         // ★ ビームのAABBを計算 ★
         if (!beam.geometry.boundingBox) beam.geometry.computeBoundingBox(); // 初回計算
         beamBox.copy(beam.geometry.boundingBox).applyMatrix4(beam.matrixWorld);
         // ↑↑↑ --- ここまで追加 --- ↑↑↑




         const cylinders = this.rigidBodies.filter(obj => obj.geometry.type === 'CylinderGeometry');

         // すべての円柱について処理
         for (const cylinder of cylinders) {
             // すでに破壊フラグが立っている円柱は無視
             if (cylinder.userData.isDestroyed) continue;

             // ★ 円柱のAABBを計算 ★
             if (!cylinder.geometry.boundingBox) cylinder.geometry.computeBoundingBox(); // 初回計算
             cylinderBox.copy(cylinder.geometry.boundingBox).applyMatrix4(cylinder.matrixWorld);

             // ★ AABB同士の交差判定 ★
             if (beamBox.intersectsBox(cylinderBox)) {
                 console.log("Beam AABB hit cylinder AABB!"); // ログで確認
                 cylinder.userData.isDestroyed = true; // 破壊フラグを立てる
                 // ★必要なら break; で1ヒットのみにする★
                 // break;
             }
             // ↑↑↑ --- ここまで挿入 --- ↑↑↑





         }
     }
     // ★★★ 衝突判定ループここまで ★★★


     // ★★★ 2. 破壊処理ループ (新規追加) ★★★
     // rigidBodies 配列を後ろからチェック (途中で要素を削除するため)
     for (let i = this.rigidBodies.length - 1; i >= 0; i--) {
         const obj = this.rigidBodies[i];

         // 円柱であり、かつ破壊フラグが true のオブジェクトを見つける
         if (obj.geometry.type === 'CylinderGeometry' && obj.userData.isDestroyed) {
              console.log("Destroying cylinder:", obj); // ログで確認
             // 破片を生成するメソッドを呼び出す
             this.createFragments(obj); // (このメソッドは別途定義済みの前提)

             // 元の円柱をシーンから削除
             this.scene.remove(obj);
             // 物理ワールドからも対応するボディを削除
             if (obj.userData.physicsBody) {
                 this.physicsWorld.removeRigidBody(obj.userData.physicsBody);
                 // TODO: Ammo オブジェクトのメモリ解放が必要か確認 (Ammo.destroy)
             }
             // rigidBodies 配列からも削除
             this.rigidBodies.splice(i, 1);
             // Three.js オブジェクトのメモリ解放
             if (obj.geometry) obj.geometry.dispose();
             if (obj.material) obj.material.dispose();
         }
     }
     // ★★★ 破壊処理ループここまで ★★★





    
    for (let i = 0; i < this.rigidBodies.length; i++) {
      const mesh = this.rigidBodies[i];
      const physicsBody = mesh.userData.physicsBody;
      if (physicsBody && physicsBody.getMotionState()) {
        const ms = physicsBody.getMotionState();
        ms.getWorldTransform(this.tempTransform);
        const p = this.tempTransform.getOrigin();
        const q = this.tempTransform.getRotation();
        mesh.position.set(p.x(), p.y(), p.z());
        mesh.quaternion.set(q.x(), q.y(), q.z(), q.w());
      }
    }

        // --- ▼ ビームの更新処理を追加 ▼ ---
        // 配列を逆からループ（途中で要素を削除するため）
        for (let i = this.activeBeams.length - 1; i >= 0; i--) {
            const beam = this.activeBeams[i];

            // 寿命を減らす
            beam.userData.lifetime -= delta;

            // 寿命が尽きたら削除
            if (beam.userData.lifetime <= 0) {
                this.scene.remove(beam); // シーンから削除
                // ★ ジオメトリやマテリアルの破棄も検討 (メモリリーク対策)
                if (beam.geometry) beam.geometry.dispose();
                if (beam.material) beam.material.dispose();
                this.activeBeams.splice(i, 1); // 配列から削除
                continue; // 次のビームへ
            }

            // 位置を更新
            beam.position.addScaledVector(beam.userData.velocity, delta);

            // (オプション) ビームの回転（常に進行方向を向くようにする場合など）
            // beam.lookAt(beam.position.clone().add(beam.userData.velocity));
        }
        // --- ▲ ビームの更新処理を追加 ▲ ---


        // --- ▼ 輪の更新処理を追加 ▼ ---
        for (let i = this.activeRings.length - 1; i >= 0; i--) {
            const ring = this.activeRings[i];

            // 寿命を減らす
            ring.userData.lifetime -= delta;

            // 寿命が尽きたら削除
            if (ring.userData.lifetime <= 0) {
                this.scene.remove(ring); // シーンから削除
                // メモリ解放
                if (ring.geometry) ring.geometry.dispose();
                if (ring.material) ring.material.dispose();
                this.activeRings.splice(i, 1); // 配列から削除
            } else {
                // フェードアウト処理
                if (ring.material.transparent && ring.userData.initialLifetime > 0) {
                    // 寿命の残り割合に応じて不透明度を変化させる
                    ring.material.opacity = Math.max(0, ring.userData.lifetime / ring.userData.initialLifetime);
                }
                // (オプション) 少しずつ拡大するなどのエフェクトも追加可能
                // ring.scale.multiplyScalar(1 + delta * 2); // 例: 拡大
            }
        }
        // --- ▲ 輪の更新処理を追加 ▲ ---


     // ★★★ 3. 破片アニメーションループ (新規追加) ★★★
     const gravity = 9.8 * 2; // 破片にかかる重力
     // activeFragments 配列を後ろからループ
     for (let i = this.activeFragments.length - 1; i >= 0; i--) {
         const fragment = this.activeFragments[i];

         // 寿命を減らす
         fragment.userData.lifetime -= delta;

         // 寿命が尽きたら削除
         if (fragment.userData.lifetime <= 0) {
             this.scene.remove(fragment); // シーンから削除
             // マテリアルは複製したので dispose する
             if (fragment.material) fragment.material.dispose();
             // ジオメトリは共有しているので dispose しない
             this.activeFragments.splice(i, 1); // 配列から削除
         } else {
             // 物理演算を使わない簡易的な動き
             // 位置を更新
             fragment.position.addScaledVector(fragment.userData.velocity, delta);
             // 重力の影響
             fragment.userData.velocity.y -= gravity * delta;
             // 回転を更新
             fragment.rotation.x += fragment.userData.angularVelocity.x * delta;
             fragment.rotation.y += fragment.userData.angularVelocity.y * delta;
             fragment.rotation.z += fragment.userData.angularVelocity.z * delta;
             // (オプション: フェードアウト)
             // if (fragment.material.transparent) {
             //     fragment.material.opacity = Math.max(0, fragment.userData.lifetime / 1.5); // 例
             // }
         }
     }
     // ★★★ 破片アニメーションループここまで ★★★

     // --- ▲▲▲ ここまで追加/変更 ▲▲▲ ---


    
    // キャラクターフォローカメラの設定
    if (this.characterController && this.characterController.characterModel) {
      const characterPosition = this.characterController.characterModel.position;
      
      if (this.cameraFollowMode) {
        // ターゲットのみを更新（カメラ位置は自由に操作可能にする）
        this.controls.target.set(
          characterPosition.x,
          characterPosition.y + 1.0,
          characterPosition.z
        );
      }
    }
    
    if (this.controls) {
      this.controls.update();
    }
    
    this.renderer.render(this.scene, this.camera);
  }
}

Ammo().then((AmmoLib) => {
  console.log("Ammo.js initialized");
  try {
    const game = new GameScene(AmmoLib);
    game.init();
  } catch (err) {
    console.error("Error during Game setup:", err);
  }
}).catch(err => {
  console.error("Error initializing Ammo.js:", err);
});