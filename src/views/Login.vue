<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAgentStore } from '@/stores/agentStore'
import axios from 'axios'
import { setAccessToken, clearAccessToken } from '@/utils/authStorage'

const router = useRouter()
const agentStore = useAgentStore()

const username = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

const handleLogin = async () => {
  if (!username.value || !password.value) {
    error.value = '请输入用户名和密码'
    return
  }

  loading.value = true
  error.value = ''

  try {
    const response = await axios.post(`${API_BASE}/api/agent/login`, {
      username: username.value,
      password: password.value
    })

    if (!response.data.success) {
      throw new Error(response.data.message || '登录失败')
    }

    setAccessToken(response.data.token)

    await agentStore.login({
      agentId: response.data.agent.username,
      agentName: response.data.agent.name,
      role: response.data.agent.role
    } as any)

    router.push('/dashboard')
  } catch (err: any) {
    error.value = err.response?.data?.detail || err.message || '登录失败'
    clearAccessToken()
  } finally {
    loading.value = false
  }
}

// ==========================================
// 粒子交互特效逻辑 (Antigravity Effect)
// ==========================================
const canvasRef = ref<HTMLCanvasElement | null>(null)
let ctx: CanvasRenderingContext2D | null = null
let animationFrameId: number
let particles: Particle[] = []
let mouse = { x: -9999, y: -9999 } // 初始鼠标位置在屏幕外

// 粒子配置
const PARTICLE_COUNT_FACTOR = 9000 // 屏幕面积除以此数等于粒子数 (数值越大粒子越少)
const CONNECT_DISTANCE = 110 // 连线距离
const MOUSE_REPULSION_RADIUS = 120 // 鼠标排斥半径
const MOUSE_REPULSION_FORCE = 8 // 排斥力度

class Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  baseX: number
  baseY: number
  density: number

  constructor(width: number, height: number) {
    this.x = Math.random() * width
    this.y = Math.random() * height
    this.vx = (Math.random() - 0.5) * 0.8 // 随机横向速度
    this.vy = (Math.random() - 0.5) * 0.8 // 随机纵向速度
    this.size = Math.random() * 2 + 1
    this.baseX = this.x
    this.baseY = this.y
    this.density = (Math.random() * 30) + 1
  }

  update(width: number, height: number) {
    // 1. 基础移动
    this.x += this.vx
    this.y += this.vy

    // 2. 边界反弹
    if (this.x < 0 || this.x > width) this.vx = -this.vx
    if (this.y < 0 || this.y > height) this.vy = -this.vy

    // 3. 鼠标交互 (Antigravity / Repulsion)
    const dx = mouse.x - this.x
    const dy = mouse.y - this.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance < MOUSE_REPULSION_RADIUS) {
      // 计算斥力方向和大小
      const forceDirectionX = dx / distance
      const forceDirectionY = dy / distance
      const force = (MOUSE_REPULSION_RADIUS - distance) / MOUSE_REPULSION_RADIUS
      const directionX = forceDirectionX * force * this.density * MOUSE_REPULSION_FORCE
      const directionY = forceDirectionY * force * this.density * MOUSE_REPULSION_FORCE

      // 粒子被推开
      this.x -= directionX
      this.y -= directionY
    }
  }

  draw() {
    if (!ctx) return
    // 使用品牌色 1890FF (蚂蚁蓝) 的变体，降低不透明度
    ctx.fillStyle = 'rgba(24, 144, 255, 0.55)'
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
    ctx.closePath()
    ctx.fill()
  }
}

function initParticles() {
  if (!canvasRef.value) return
  const { width, height } = canvasRef.value
  particles = []
  const numberOfParticles = (width * height) / PARTICLE_COUNT_FACTOR
  for (let i = 0; i < numberOfParticles; i++) {
    particles.push(new Particle(width, height))
  }
}

function animate() {
  if (!canvasRef.value || !ctx) return
  const width = canvasRef.value.width
  const height = canvasRef.value.height
  
  ctx.clearRect(0, 0, width, height)

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]
    if (!p) continue
    p.update(width, height)
    p.draw()

    // 粒子连线逻辑
    for (let j = i; j < particles.length; j++) {
      const p2 = particles[j]
      if (!p2) continue
      const dx = p.x - p2.x
      const dy = p.y - p2.y
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance < CONNECT_DISTANCE) {
        ctx.beginPath()
        // 距离越近线越粗，颜色越深 - 使用蚂蚁蓝
        const opacity = 1 - (distance / CONNECT_DISTANCE)
        ctx.strokeStyle = `rgba(24, 144, 255, ${opacity * 0.18})`
        ctx.lineWidth = 1
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p2.x, p2.y)
        ctx.stroke()
      }
    }
  }
  animationFrameId = requestAnimationFrame(animate)
}

function handleResize() {
  if (canvasRef.value) {
    canvasRef.value.width = window.innerWidth
    canvasRef.value.height = window.innerHeight
    initParticles()
  }
}

function handleMouseMove(e: MouseEvent) {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (rect) {
    mouse.x = e.clientX - rect.left
    mouse.y = e.clientY - rect.top
  }
}

function handleMouseLeave() {
  mouse.x = -9999
  mouse.y = -9999
}

onMounted(() => {
  if (canvasRef.value) {
    ctx = canvasRef.value.getContext('2d')
    canvasRef.value.width = window.innerWidth
    canvasRef.value.height = window.innerHeight
    
    initParticles()
    animate()

    window.addEventListener('resize', handleResize)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseout', handleMouseLeave)
  }
})

onUnmounted(() => {
  cancelAnimationFrame(animationFrameId)
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('mousemove', handleMouseMove)
  window.removeEventListener('mouseout', handleMouseLeave)
})
</script>

<template>
  <div class="login-container">
    <div class="login-background">
      <canvas ref="canvasRef" class="particle-canvas"></canvas>
      
      <div class="gradient-orb orb-1"></div>
      <div class="gradient-orb orb-2"></div>
      <div class="grid-pattern"></div>
    </div>

    <div class="login-box">
      <div class="login-header">
        <div class="brand-logo-container">
          <img src="/fiido2.png" alt="Fiido Logo" class="fiido-logo" />
        </div>
        <h1>客服工作台</h1>
        <p class="subtitle">CUSTOMER SERVICE WORKBENCH</p>
        <div class="divider"></div>
        <span class="welcome-text">欢迎登录，开始您的服务</span>
      </div>

      <form @submit.prevent="handleLogin" class="login-form">
        <div class="form-group">
          <label for="username">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            用户名
          </label>
          <input
            id="username"
            v-model="username"
            type="text"
            placeholder="请输入用户名，例如：admin"
            required
            class="form-input"
          >
        </div>

        <div class="form-group">
          <label for="password">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            密码
          </label>
          <input
            id="password"
            v-model="password"
            type="password"
            placeholder="请输入密码"
            required
            class="form-input"
          >
        </div>

        <div v-if="error" class="error-message">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          {{ error }}
        </div>

        <button type="submit" :disabled="loading" class="login-button">
          <span v-if="!loading" class="button-content">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
              <polyline points="10 17 15 12 10 7"></polyline>
              <line x1="15" y1="12" x2="3" y2="12"></line>
            </svg>
            登录工作台
          </span>
          <span v-else class="loading-content">
            <div class="spinner-ring"></div>
            登录中...
          </span>
        </button>
      </form>

      <div class="login-footer">
        <div class="footer-links">
          <span class="footer-text">Powered by Fiido AI System</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ========== 登录页面容器 ========== */
/* 保留原有粒子特效设计，优化配色以匹配专业客服系统风格 */
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #F7F8FA 0%, #EBF5FF 100%);
  position: relative;
  overflow: hidden;
}

.login-background {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
}

/* 粒子画布样式 */
.particle-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 2;
  pointer-events: none;
}

/* 渐变装饰球 */
.gradient-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  opacity: 0.25;
  animation: float 25s ease-in-out infinite;
  z-index: 1;
}

.orb-1 {
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, var(--agent-primary-color, #1890FF) 0%, transparent 70%);
  top: -250px;
  left: -250px;
  animation-delay: 0s;
}

.orb-2 {
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, var(--agent-primary-hover, #40A9FF) 0%, transparent 70%);
  bottom: -200px;
  right: -200px;
  animation-delay: 12s;
}

@keyframes float {
  0%, 100% {
    transform: translate(0, 0) scale(1);
  }
  33% {
    transform: translate(30px, -30px) scale(1.1);
  }
  66% {
    transform: translate(-20px, 20px) scale(0.9);
  }
}

/* 网格背景 */
.grid-pattern {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image:
    linear-gradient(rgba(24, 144, 255, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(24, 144, 255, 0.03) 1px, transparent 1px);
  background-size: 50px 50px;
  animation: gridMove 60s linear infinite;
  z-index: 0;
}

@keyframes gridMove {
  0% {
    transform: translate(0, 0);
  }
  100% {
    transform: translate(50px, 50px);
  }
}

/* ========== 登录卡片 ========== */
.login-box {
  background: var(--agent-secondary-bg, #FFFFFF);
  padding: 48px 44px;
  border-radius: var(--agent-border-radius-xl, 12px);
  box-shadow: var(--agent-shadow-xl, 0 12px 32px rgba(0, 0, 0, 0.12));
  width: 100%;
  max-width: 440px;
  position: relative;
  z-index: 10;
  animation: slideIn 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  border: 1px solid var(--agent-border-color-light, #F0F0F0);
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(40px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* ========== 头部区域 ========== */
.login-header {
  text-align: center;
  margin-bottom: 36px;
}

.brand-logo-container {
  margin-bottom: 24px;
  animation: logoAppear 0.8s ease 0.2s both;
}

@keyframes logoAppear {
  from {
    opacity: 0;
    transform: scale(0.8);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.fiido-logo {
  height: 72px;
  width: auto;
  filter: drop-shadow(0 4px 12px rgba(24, 144, 255, 0.15));
}

.login-header h1 {
  font-size: 28px;
  font-weight: 700;
  color: var(--agent-text-color, #262626);
  margin: 0 0 8px 0;
  letter-spacing: -0.5px;
}

.subtitle {
  font-size: 11px;
  color: var(--agent-primary-color, #1890FF);
  margin: 0;
  letter-spacing: 3px;
  text-transform: uppercase;
  font-weight: 600;
}

.divider {
  width: 56px;
  height: 3px;
  background: linear-gradient(90deg, var(--agent-primary-color, #1890FF), var(--agent-primary-hover, #40A9FF));
  margin: 18px auto;
  border-radius: 2px;
}

.welcome-text {
  display: block;
  font-size: 14px;
  color: var(--agent-text-secondary, #595959);
  font-weight: 400;
}

/* ========== 表单样式 ========== */
.login-form {
  display: flex;
  flex-direction: column;
}

.form-group {
  margin-bottom: 22px;
}

.form-group label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--agent-text-color, #262626);
  margin-bottom: 10px;
}

.form-group label svg {
  color: var(--agent-primary-color, #1890FF);
}

.form-input {
  width: 100%;
  padding: 13px 16px;
  border: 1px solid var(--agent-border-color, #E8E8E8);
  border-radius: var(--agent-border-radius, 6px);
  font-size: 14px;
  transition: all var(--transition-normal, 0.2s ease);
  box-sizing: border-box;
  background: var(--agent-secondary-bg, #FFFFFF);
  color: var(--agent-text-color, #262626);
}

.form-input:hover {
  border-color: var(--agent-border-color-dark, #D9D9D9);
}

.form-input:focus {
  outline: none;
  border-color: var(--agent-primary-color, #1890FF);
  box-shadow: 0 0 0 3px rgba(24, 144, 255, 0.1);
}

.form-input::placeholder {
  color: var(--agent-text-placeholder, #BFBFBF);
}

/* ========== 错误信息 ========== */
.error-message {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--agent-danger-light, #FFF2F0);
  color: var(--agent-danger, #FF4D4F);
  padding: 13px 16px;
  border-radius: var(--agent-border-radius, 6px);
  font-size: 13px;
  margin-bottom: 22px;
  border-left: 3px solid var(--agent-danger, #FF4D4F);
  font-weight: 500;
  animation: shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97);
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-6px); }
  20%, 40%, 60%, 80% { transform: translateX(6px); }
}

.error-message svg {
  flex-shrink: 0;
}

/* ========== 登录按钮 ========== */
.login-button {
  width: 100%;
  padding: 14px 24px;
  background: linear-gradient(135deg, var(--agent-primary-color, #1890FF) 0%, var(--agent-primary-hover, #40A9FF) 100%);
  color: white;
  border: none;
  border-radius: var(--agent-border-radius, 6px);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-normal, 0.2s ease);
  box-shadow: 0 4px 14px rgba(24, 144, 255, 0.35);
  position: relative;
  overflow: hidden;
}

.login-button::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent);
  transition: left 0.5s;
}

.login-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(24, 144, 255, 0.45);
}

.login-button:hover:not(:disabled)::before {
  left: 100%;
}

.login-button:active:not(:disabled) {
  transform: translateY(0);
}

.login-button:disabled {
  opacity: 0.65;
  cursor: not-allowed;
  transform: none;
}

.button-content,
.loading-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.spinner-ring {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ========== 底部信息 ========== */
.login-footer {
  margin-top: 32px;
  text-align: center;
  padding-top: 20px;
  border-top: 1px solid var(--agent-border-color-light, #F0F0F0);
}

.footer-links {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
}

.footer-text {
  font-size: 12px;
  color: var(--agent-text-tertiary, #8C8C8C);
  font-weight: 500;
}

/* ========== 响应式 ========== */
@media (max-width: 480px) {
  .login-box {
    padding: 36px 28px;
    margin: 16px;
  }

  .login-header h1 {
    font-size: 24px;
  }

  .fiido-logo {
    height: 60px;
  }

  .form-input {
    font-size: 16px; /* 防止iOS缩放 */
  }
}
</style>
