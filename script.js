import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import confetti from 'canvas-confetti';

// --- 全局变量 ---
let scene, camera, renderer, controls;
const cubes = []; // 存储所有 27 个小块
let isAnimating = false; // 防止动画重叠
let isDragging = false;
let startMouse = new THREE.Vector2();
let intersectPoint = null;
let intersectNormal = null;
let intersectObject = null;
const rays = []; // 存储短射线
const moveHistory = []; // 存储移动历史 { axis, layer, angle }
let isShuffling = false;

let currentMode = 'view'; // 'view' or 'fixed'

// 魔方参数
const CUBE_SIZE = 1;
const SPACING = 0.05; // 间隙
const TOTAL_SIZE = CUBE_SIZE + SPACING;

// 颜色定义 (标准魔方配色)
const COLORS = {
    U: 0xFFFFFF, // Up - White
    D: 0xFFFF00, // Down - Yellow
    L: 0x00FF00, // Left - Green
    R: 0x0000FF, // Right - Blue
    F: 0xFF0000, // Front - Red
    B: 0xFFA500, // Back - Orange
    Core: 0x222222 // 内部颜色
};

// 初始化
init();
animate();

function init() {
    // 1. 场景
    scene = new THREE.Scene();
    
    // 2. 相机
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(5, 5, 7);
    camera.lookAt(0, 0, 0);

    // 3. 渲染器
    const canvasContainer = document.getElementById('canvas-container');
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    canvasContainer.appendChild(renderer.domElement);

    // 4. 灯光 (增强版)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4); // 降低环境光，让霓虹更突出
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);
    
    // 霓虹点光源
    const light1 = new THREE.PointLight(0x00ffff, 2, 50); // 青色
    light1.position.set(5, 5, 5);
    scene.add(light1);

    const light2 = new THREE.PointLight(0xff00ff, 2, 50); // 紫色
    light2.position.set(-5, -5, 5);
    scene.add(light2);

    const light3 = new THREE.PointLight(0xffff00, 1, 50); // 金色
    light3.position.set(0, 5, -5);
    scene.add(light3);

    // 5. 控制器 (用于旋转视角)
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.minDistance = 3;
    controls.maxDistance = 15;

    // 6. 创建魔方
    createRubiksCube();
    
    // 初始化打乱
    shuffleCube();
    
    // 7. 创建星空背景
    createStarfield();
    
    // 8. 创建射线背景特效
    createBackgroundRays();

    // 9. 事件监听
    window.addEventListener('resize', onWindowResize);
    
    const canvas = renderer.domElement;
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    
    // 触摸事件支持
    canvas.addEventListener('touchstart', onTouchStart, {passive: false});
    canvas.addEventListener('touchmove', onTouchMove, {passive: false});
    window.addEventListener('touchend', onMouseUp);

    // 按钮事件
    document.getElementById('shuffle-btn').addEventListener('click', shuffleCube);
    document.getElementById('reset-btn').addEventListener('click', resetCube);
    document.getElementById('undo-btn').addEventListener('click', undoLastMove);

    // 模式切换
    document.getElementById('view-mode-btn').addEventListener('click', () => setMode('view'));
    document.getElementById('fixed-mode-btn').addEventListener('click', () => setMode('fixed'));
}

function createGradientTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 1;
    const context = canvas.getContext('2d');
    const gradient = context.createLinearGradient(0, 0, 64, 0);
    gradient.addColorStop(0, 'rgba(255,255,255,0)');
    gradient.addColorStop(1, 'rgba(255,255,255,1)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 1);
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}

function createBackgroundRays() {
    const texture = createGradientTexture();
    const geometry = new THREE.BoxGeometry(1, 1, 1); // 基础几何体，通过 scale 调整长宽

    for (let i = 0; i < 180; i++) { // 数量增加到 180
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff, // 基础色，后面会覆盖
            map: texture,
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending,
            depthWrite: false, // 射线本身不写入深度
            // depthTest: false // 移除这行，启用深度测试，这样射线会被前面的魔方遮挡
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = -1; // 保持背景渲染顺序
        
        resetRay(mesh);
        // 随机初始进度
        mesh.userData.currentDist = 10 + Math.random() * 40;
        
        scene.add(mesh);
        rays.push(mesh);
    }
}

function resetRay(mesh) {
    // 随机方向
    const direction = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
    ).normalize();
    
    // 随机颜色 (蓝/紫/白)
    const colorType = Math.random();
    let color;
    if (colorType < 0.33) { // 蓝
        color = 0x00ccff; 
    } else if (colorType < 0.66) { // 紫
        color = 0xcc00ff;
    } else { // 白
        color = 0xffffff;
    }
    mesh.material.color.setHex(color);
    
    const length = 2 + Math.random() * 4;
    const width = 0.05; // 宽度增加

    mesh.scale.set(length, width, width); // X轴为长度方向
    
    mesh.userData = {
        direction: direction,
        speed: 0.1 + Math.random() * 0.3,
        length: length,
        currentDist: 10 + Math.random() * 5,
    };
}

function updateRays() {
    rays.forEach(mesh => {
        const data = mesh.userData;
        
        // 更新距离
        data.currentDist += data.speed;
        
        // 如果太远，重置
        if (data.currentDist > 60) {
            data.currentDist = 10 + Math.random() * 5;
            resetRay(mesh);
            mesh.userData.currentDist = 10 + Math.random() * 5;
        }
        
        // 计算位置：让 Mesh 的尾部在 currentDist，头部朝向外
        // 因为 Mesh 中心在几何体中心，且 geometry 长为 1，scale.x 为 length
        // 我们需要让 Mesh 中心位于 currentDist + length/2 处
        // 并且让 X 轴正方向朝向外
        
        const centerDist = data.currentDist + data.length / 2;
        const pos = data.direction.clone().multiplyScalar(centerDist);
        mesh.position.copy(pos);
        
        // 设置朝向：X 轴对齐方向
        // lookAt 默认是 Z 轴对齐目标。我们需要让 X 轴对齐。
        // 简单的办法是：让 geometry 的 Z 轴作为长度方向，然后 lookAt
        // 这里为了兼容贴图方向 (贴图通常是 UV 的 U 方向即 X 轴)，我们还是保持 X 轴为长度
        // 那么需要 mesh.lookAt 之后再旋转 90 度？
        // 比较方便的是用 quaternion.setFromUnitVectors
        
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), data.direction);
    });
}

function createStarfield() {
    // 1. 细碎星尘 (数量多，尺寸小，透明度低)
    const dustGeometry = new THREE.BufferGeometry();
    const dustCount = 3000;
    const dustPos = new Float32Array(dustCount * 3);
    const dustColors = new Float32Array(dustCount * 3);

    for(let i = 0; i < dustCount * 3; i++) {
        dustPos[i] = (Math.random() - 0.5) * 120;
        // 偏冷色调
        const color = new THREE.Color();
        color.setHSL(0.6 + Math.random() * 0.2, 0.8, 0.8);
        dustColors[i] = color.r;
        dustColors[i+1] = color.g;
        dustColors[i+2] = color.b;
    }
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    dustGeometry.setAttribute('color', new THREE.BufferAttribute(dustColors, 3)); // 虽然 PointsMaterial vertexColors 可能是 RGB，但这里简化处理

    const dustMaterial = new THREE.PointsMaterial({
        size: 0.05,
        color: 0xffffff,
        transparent: true,
        opacity: 0.4,
        sizeAttenuation: true
    });
    const dust = new THREE.Points(dustGeometry, dustMaterial);
    scene.add(dust);

    // 2. 微光粒子 (数量少，尺寸稍大，更亮)
    const starGeometry = new THREE.BufferGeometry();
    const starCount = 500;
    const starPos = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3); // 如果想用 vertexColors

    for(let i = 0; i < starCount * 3; i+=3) {
        starPos[i] = (Math.random() - 0.5) * 100;
        starPos[i+1] = (Math.random() - 0.5) * 100;
        starPos[i+2] = (Math.random() - 0.5) * 100;
        
        // 蓝紫色系
        const color = new THREE.Color();
        color.setHSL(0.6 + Math.random() * 0.3, 1.0, 0.7);
        starColors[i] = color.r;
        starColors[i+1] = color.g;
        starColors[i+2] = color.b;
    }
    
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

    const starMaterial = new THREE.PointsMaterial({
        size: 0.15,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        sizeAttenuation: true,
        blending: THREE.AdditiveBlending
    });
    
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);
}

function setMode(mode) {
    currentMode = mode;
    document.getElementById('view-mode-btn').classList.toggle('active', mode === 'view');
    document.getElementById('fixed-mode-btn').classList.toggle('active', mode === 'fixed');
    
    // 重置控制器状态
    if (mode === 'fixed') {
        controls.enabled = false;
    } else {
        controls.enabled = true;
    }
}

function createRubiksCube() {
    // 清理旧魔方
    cubes.forEach(cube => scene.remove(cube));
    cubes.length = 0;

    // 使用 RoundedBoxGeometry 实现圆滑倒角
    // 参数: width, height, depth, segments, radius
    const geometry = new RoundedBoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE, 4, 0.1);

    // 生成 3x3x3 网格
    for (let x = -1; x <= 1; x++) {
        for (let y = -1; y <= 1; y++) {
            for (let z = -1; z <= 1; z++) {
                // 为每个面创建材质 (MeshPhysicalMaterial 不透明水晶质感)
                const createMaterial = (color) => {
                    return new THREE.MeshPhysicalMaterial({
                        color: color,
                        metalness: 0.1,
                        roughness: 0.1, // 表面光滑
                        transmission: 0.2, // 低透光率，实现半透明而非全透明
                        thickness: 2.0, // 增加厚度感
                        clearcoat: 1.0, // 清漆层，增强光泽
                        clearcoatRoughness: 0.1,
                        ior: 1.5, // 折射率
                        reflectivity: 0.5, // 反射率
                        iridescence: 0.3, // 微弱的彩虹色反光
                    });
                };
                
                // 内部核心颜色
                const coreMat = new THREE.MeshPhysicalMaterial({
                    color: 0x111111,
                    metalness: 0.5,
                    roughness: 0.2,
                    transmission: 0.1,
                    thickness: 1.0
                });

                const materials = [
                    x === 1 ? createMaterial(COLORS.R) : coreMat, // Right
                    x === -1 ? createMaterial(COLORS.L) : coreMat, // Left
                    y === 1 ? createMaterial(COLORS.U) : coreMat, // Top
                    y === -1 ? createMaterial(COLORS.D) : coreMat, // Bottom
                    z === 1 ? createMaterial(COLORS.F) : coreMat, // Front
                    z === -1 ? createMaterial(COLORS.B) : coreMat, // Back
                ];

                const cube = new THREE.Mesh(geometry, materials);
                cube.renderOrder = 1; // 确保魔方在背景射线之前渲染（覆盖背景）
                
                // 设置位置 (引入一点间隙)
                cube.position.set(x * TOTAL_SIZE, y * TOTAL_SIZE, z * TOTAL_SIZE);
                
                // 存储初始坐标，用于后续判断
                cube.userData = { 
                    initialPosition: new THREE.Vector3(x, y, z),
                    isCubie: true 
                };

                // 移除线框，因为倒角几何体加线框会很乱，且倒角本身就有轮廓感
                // 如果需要描边，可以考虑用 EdgesGeometry 但需要配合 threshold 过滤掉倒角的线
                // 这里为了美观，暂不加线框，或者只加一个很细的整体线框（可选）
                
                scene.add(cube);
                cubes.push(cube);
            }
        }
    }
}

// --- 交互逻辑 ---

function getIntersects(event, element) {
    const rect = element.getBoundingClientRect();
    let clientX, clientY;

    if (event.changedTouches) {
        clientX = event.changedTouches[0].clientX;
        clientY = event.changedTouches[0].clientY;
    } else {
        clientX = event.clientX;
        clientY = event.clientY;
    }

    const mouse = new THREE.Vector2();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    return raycaster.intersectObjects(cubes);
}

function onMouseDown(event) {
    if (isAnimating) return;

    // 观察模式下，所有点击都作为背景拖动（旋转视角），忽略魔方点击
    if (currentMode === 'view') {
        controls.enabled = true;
        return;
    }

    const intersects = getIntersects(event, renderer.domElement);
    // 过滤掉没有 face 的交点 (例如 LineSegments)
    const intersect = intersects.find(hit => hit.face);
    
    if (intersect) {
        // 点击到了魔方
        controls.enabled = false; // 禁用视角旋转
        intersectObject = intersect.object;
        intersectPoint = intersect.point;
        intersectNormal = intersect.face.normal.clone();
        
        // 转换 normal 到世界坐标 (虽然 cubie 可能旋转，但我们这里只需要大概方向)
        // 注意：小块旋转后，geometry 的 face normal 不变，需要应用 mesh 的 quaternion
        intersectNormal.applyQuaternion(intersectObject.quaternion).round();

        isDragging = true; // 确保所有属性都准备好后再置为 true

        if (event.changedTouches) {
            startMouse.set(event.changedTouches[0].clientX, event.changedTouches[0].clientY);
        } else {
            startMouse.set(event.clientX, event.clientY);
        }
    } else {
        // 固定模式下，点击背景也不允许转动视角
        if (currentMode === 'fixed') {
            controls.enabled = false;
        }
    }
}

function onTouchStart(event) {
    event.preventDefault(); // 防止滚动
    onMouseDown(event);
}

function onMouseMove(event) {
    if (!isDragging || isAnimating) return;
    
    let clientX, clientY;
    if (event.changedTouches) {
        clientX = event.changedTouches[0].clientX;
        clientY = event.changedTouches[0].clientY;
    } else {
        clientX = event.clientX;
        clientY = event.clientY;
    }

    const deltaX = clientX - startMouse.x;
    const deltaY = clientY - startMouse.y;
    
    // 最小滑动距离
    if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) return;

    // 确定滑动方向和旋转轴
    handleSwipe(deltaX, deltaY);
    
    isDragging = false; // 触发一次后重置，防止连续触发
    controls.enabled = true;
}

function onTouchMove(event) {
    event.preventDefault();
    onMouseMove(event);
}

function onMouseUp() {
    isDragging = false;
    
    // 如果是固定模式，始终保持 controls 禁用，防止误触后恢复
    if (currentMode === 'fixed') {
        controls.enabled = false;
    } else {
        controls.enabled = true;
    }
}

function handleSwipe(dx, dy) {
    if (!intersectObject || !intersectPoint) return;

    // 构造鼠标滑动向量 (屏幕空间)
    const mouseDir = new THREE.Vector2(dx, -dy).normalize();

    // 候选轴 (世界坐标系)
    const axes = [
        { name: 'x', vec: new THREE.Vector3(1, 0, 0) },
        { name: 'y', vec: new THREE.Vector3(0, 1, 0) },
        { name: 'z', vec: new THREE.Vector3(0, 0, 1) }
    ];

    let bestMatch = null;
    let maxDot = -1;

    axes.forEach(axis => {
        // 计算绕该轴旋转时，点击点的瞬时速度向量 (v = w x r)
        // 假设 w 为单位向量 (正方向)
        const tangent = new THREE.Vector3().crossVectors(axis.vec, intersectPoint);
        
        // 如果点击点在轴上 (力臂为0)，则无法通过该点驱动旋转
        if (tangent.lengthSq() < 0.01) return;

        // 将切线向量投影到屏幕空间
        const p1 = intersectPoint.clone().project(camera);
        // 取一小段切线向量 projected
        const p2 = intersectPoint.clone().add(tangent.normalize().multiplyScalar(0.1)).project(camera);
        
        const screenVec = new THREE.Vector2(p2.x - p1.x, p2.y - p1.y).normalize();

        // 计算匹配度 (点积)
        const dot = mouseDir.dot(screenVec);
        
        // 取绝对值寻找最佳匹配轴
        if (Math.abs(dot) > maxDot) {
            maxDot = Math.abs(dot);
            bestMatch = {
                axis: axis.name,
                direction: Math.sign(dot) // 1 表示同向 (正旋转), -1 表示反向 (负旋转)
            };
        }
    });

    if (!bestMatch || maxDot < 0.5) return; // 匹配度太低忽略

    const rotateAxis = bestMatch.axis;
    const direction = bestMatch.direction;

    // 确定旋转层
    let layerCoord;
    if (rotateAxis === 'x') layerCoord = intersectObject.position.x;
    if (rotateAxis === 'y') layerCoord = intersectObject.position.y;
    if (rotateAxis === 'z') layerCoord = intersectObject.position.z;
    
    const layerIndex = Math.round(layerCoord / TOTAL_SIZE);

    // 记录移动到历史
    const move = { axis: rotateAxis, layer: layerIndex, angle: direction * Math.PI / 2 };
    moveHistory.push(move);

    rotateLayer(move.axis, move.layer, move.angle);
}

// --- 动画与核心逻辑 ---

function rotateLayer(axis, layerIndex, angle, duration = 300, onComplete) {
    if (isAnimating && !onComplete) return; // 允许内部递归调用但不允许外部打断
    isAnimating = true;

    // 1. 找到该层的所有小块
    const activeCubes = [];
    const threshold = SPACING / 2 + 0.1; // 容差
    
    cubes.forEach(cube => {
        let posVal;
        if (axis === 'x') posVal = cube.position.x;
        if (axis === 'y') posVal = cube.position.y;
        if (axis === 'z') posVal = cube.position.z;
        
        // 判断是否在层内 (注意坐标是 world position)
        if (Math.abs(posVal - layerIndex * TOTAL_SIZE) < threshold) {
            activeCubes.push(cube);
        }
    });

    // 2. 创建 Pivot
    const pivot = new THREE.Object3D();
    pivot.rotation.set(0, 0, 0);
    scene.add(pivot);

    // 3. 将小块 attach 到 pivot
    activeCubes.forEach(cube => {
        pivot.attach(cube);
    });

    // 4. 动画
    const targetRotation = { value: 0 };
    const endRotation = angle;
    
    // 简单的动画循环
    const startTime = Date.now();
    
    function animateRotation() {
        const now = Date.now();
        const progress = Math.min((now - startTime) / duration, 1);
        // Ease function
        const ease = 1 - Math.pow(1 - progress, 3); // Cubic ease out
        
        const currentAngle = endRotation * ease;
        
        if (axis === 'x') pivot.rotation.x = currentAngle;
        if (axis === 'y') pivot.rotation.y = currentAngle;
        if (axis === 'z') pivot.rotation.z = currentAngle;

        if (progress < 1) {
            requestAnimationFrame(animateRotation);
        } else {
            // 结束
            if (axis === 'x') pivot.rotation.x = endRotation;
            if (axis === 'y') pivot.rotation.y = endRotation;
            if (axis === 'z') pivot.rotation.z = endRotation;
            
            pivot.updateMatrixWorld();
            
            // 将小块 attach 回 scene，并保留新的变换
            activeCubes.forEach(cube => {
                scene.attach(cube);
                // 修正坐标浮点误差，防止多次旋转后对不齐
                cube.position.x = Math.round(cube.position.x / TOTAL_SIZE) * TOTAL_SIZE;
                cube.position.y = Math.round(cube.position.y / TOTAL_SIZE) * TOTAL_SIZE;
                cube.position.z = Math.round(cube.position.z / TOTAL_SIZE) * TOTAL_SIZE;
                cube.rotation.x = Math.round(cube.rotation.x / (Math.PI/2)) * (Math.PI/2);
                cube.rotation.y = Math.round(cube.rotation.y / (Math.PI/2)) * (Math.PI/2);
                cube.rotation.z = Math.round(cube.rotation.z / (Math.PI/2)) * (Math.PI/2);
                cube.updateMatrix();
            });
            
            scene.remove(pivot);
            isAnimating = false;
            
            // 检查胜利 (仅在非打乱模式下)
            if (!isShuffling) {
                checkWin();
            }
            
            if (onComplete) onComplete();
        }
    }
    
    animateRotation();
}

function undoLastMove() {
    if (isAnimating || isShuffling || moveHistory.length === 0) return;
    
    const lastMove = moveHistory.pop();
    // 反向旋转
    rotateLayer(lastMove.axis, lastMove.layer, -lastMove.angle);
}

function shuffleCube() {
    if (isAnimating) return;
    isShuffling = true;
    moveHistory.length = 0; // 清空历史
    
    const moves = 20;
    const speed = 100; // 快速
    let count = 0;
    
    document.getElementById('message').classList.add('hidden');
    
    function nextMove() {
        if (count >= moves) {
            isShuffling = false;
            return;
        }
        
        const axes = ['x', 'y', 'z'];
        const layers = [-1, 0, 1];
        const dirs = [1, -1];
        
        const axis = axes[Math.floor(Math.random() * axes.length)];
        const layer = layers[Math.floor(Math.random() * layers.length)];
        const dir = dirs[Math.floor(Math.random() * dirs.length)];
        
        rotateLayer(axis, layer, dir * Math.PI / 2, speed, nextMove);
        count++;
    }
    
    nextMove();
}

function resetCube() {
    if (isAnimating) return;
    createRubiksCube();
    moveHistory.length = 0; // 清空历史
    document.getElementById('message').classList.add('hidden');
}

function checkWin() {
    // 检查每个面的颜色是否一致
    // 这是一个简化检查：我们可以检查所有小块的旋转是否归零 (或 360 的倍数)
    // 但是小块位置变了，旋转也变了。
    
    // 正确的方法：
    // 遍历6个面的中心点，发射射线，获取该面上的9个小块的材质颜色。
    // 如果每个面的9个颜色都相同，则胜利。
    
    // 或者更简单的数学方法：
    // 魔方复原意味着每个小块都回到了它“应该”在的位置，且旋转正确。
    // 但是中心块是不动的 (在这个模型里其实也是动的，因为我们是全动模型)。
    // 实际上，中心块决定了面的颜色。
    
    // 我们用 Raycaster 检查 6 个面的中心及其周围点的颜色
    // 为了简化计算，我们直接检查所有 Mesh 的状态？太难。
    
    // 让我们用“检查每个面朝向”的方法。
    // 对于每个轴的正负方向 (共6个面)，找到所有 position 在该面上的小块。
    // 检查这些小块在该方向上的面的材质颜色是否一致。
    
    const faces = [
        { dir: new THREE.Vector3(1, 0, 0), materialIndex: 0 }, // Right
        { dir: new THREE.Vector3(-1, 0, 0), materialIndex: 1 }, // Left
        { dir: new THREE.Vector3(0, 1, 0), materialIndex: 2 }, // Top
        { dir: new THREE.Vector3(0, -1, 0), materialIndex: 3 }, // Bottom
        { dir: new THREE.Vector3(0, 0, 1), materialIndex: 4 }, // Front
        { dir: new THREE.Vector3(0, 0, -1), materialIndex: 5 }, // Back
    ];
    
    let isWin = true;
    
    for (let face of faces) {
        // 找到该面上的所有小块 (9个)
        const faceCubes = cubes.filter(c => {
            // 计算小块位置在方向向量上的投影
            // 例如 Right 面 (1,0,0)，我们要找 x 近似为 TOTAL_SIZE 的块
            const dot = c.position.dot(face.dir);
            return Math.abs(dot - TOTAL_SIZE) < 0.1;
        });
        
        if (faceCubes.length !== 9) {
            // 可能是旋转还没完全结束，或者逻辑错误
            return; 
        }
        
        // 获取第一个块在该方向上的颜色
        // 注意：小块旋转了，所以我们不能直接取 materialIndex。
        // 我们需要找到哪个材质面现在朝向 face.dir
        
        const getFaceColor = (cube) => {
            // 遍历 cube 的 6 个材质面，看哪个面的法线变换后大致等于 face.dir
            // BoxGeometry 的法线是固定的：
            // 0: (1,0,0), 1: (-1,0,0), 2: (0,1,0), 3: (0,-1,0), 4: (0,0,1), 5: (0,0,-1)
            const normals = [
                new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
                new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
                new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)
            ];
            
            for (let i = 0; i < 6; i++) {
                const worldNormal = normals[i].clone().applyQuaternion(cube.quaternion);
                if (worldNormal.dot(face.dir) > 0.9) {
                    return cube.material[i].color.getHex();
                }
            }
            return null;
        };
        
        const targetColor = getFaceColor(faceCubes[0]);
        if (targetColor === COLORS.Core) {
            // 如果核心颜色暴露在外，肯定没复原 (或者逻辑错)
            isWin = false; break; 
        }
        
        for (let i = 1; i < faceCubes.length; i++) {
            if (getFaceColor(faceCubes[i]) !== targetColor) {
                isWin = false;
                break;
            }
        }
        if (!isWin) break;
    }
    
    if (isWin) {
        celebrate();
    }
}

function celebrate() {
    const msg = document.getElementById('message');
    msg.classList.remove('hidden');
    
    // 霓虹配色礼花
    const colors = ['#00FFFF', '#FF00FF', '#FFFF00', '#FFFFFF'];
    
    // 持续 3 秒礼花
    const end = Date.now() + 3000;

    (function frame() {
        confetti({
            particleCount: 5,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors: colors
        });
        confetti({
            particleCount: 5,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors: colors
        });

        if (Date.now() < end) {
            requestAnimationFrame(frame);
        } else {
             setTimeout(() => {
                 msg.classList.add('hidden');
             }, 2000);
        }
    }());
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    updateRays(); // 更新射线动画
    controls.update();
    renderer.render(scene, camera);
}
