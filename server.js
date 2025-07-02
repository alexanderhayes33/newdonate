// server.js - Multi-User Alert System with Enhanced Bank Transfer Support + Domain Configuration
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const https = require('https'); // 🔧 เพิ่มสำหรับ HTTPS support

// Import custom modules
const UserManager = require('./utils/UserManager');
const TemplateEngine = require('./utils/TemplateEngine');

// Import TrueWallet API (optional)
let truewallet;
try {
    truewallet = require('./apis/truewallet');
    console.log('✅ TrueWallet API loaded');
} catch (error) {
    console.error('❌ TrueWallet API not found:', error.message);
    console.log('ℹ️ TrueWallet features will be disabled');
}

const HOMEPAGE_PASSWORD = process.env.HOMEPAGE_PASSWORD || 'Ba225teW'; // 🔒 รหัสสำหรับเข้า homepage
// ⚙️ Configuration - 🔧 Enhanced with Domain Support
const PORT = process.env.PORT || 3000;
const DOMAIN = process.env.DOMAIN || 'chatmateth.chat'; // 🔧 เพิ่ม Domain Configuration
const USE_HTTPS = process.env.USE_HTTPS === 'true'; // 🔧 เพิ่ม HTTPS Support

// Slip verification API credentials
const SLIP_CLIENT_ID = process.env.SLIP_CLIENT_ID || '28b0ed6dd3c9457ca7a50f976aaa1f79';
const SLIP_CLIENT_SECRET = process.env.SLIP_CLIENT_SECRET || 'lDRsRCLi52pKIk3QLY5Ov';

// สร้าง Express app
const app = express();
const server = http.createServer(app);

// 🔧 Enhanced Socket.IO Configuration with Domain Support
const io = socketIo(server, {
    cors: {
        origin: [
            `http://${DOMAIN}`,        // 🔧 รองรับ http://chatmateth.chat
            `https://${DOMAIN}`,       // 🔧 รองรับ https://chatmateth.chat
            `http://localhost:${PORT}`,
            `http://127.0.0.1:${PORT}`,
            "http://localhost:3000",   // เก็บ default port
            "http://127.0.0.1:3000",   // เก็บ default port
            "*"                        // เก็บไว้สำหรับ development
        ],
        methods: ["GET", "POST"],
        credentials: true              // 🔧 เพิ่ม credentials support
    },
    allowEIO3: true
});

// สร้าง instances
const userManager = new UserManager();
const templateEngine = new TemplateEngine();

// แสดง debug info
console.log('🔍 System Debug Info:');
templateEngine.debugInfo();

// ===============================
// Utility Functions
// ===============================
function getBangkokTime() {
    return new Date().toLocaleString('th-TH', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function isUserActive(lastActiveAt) {
    return Date.now() - lastActiveAt < 7 * 24 * 60 * 60 * 1000;
}

// ===============================
// Enhanced Bank Account Validation
// ===============================
function validateBankAccountPattern(userAccount, apiAccountValue) {
    try {
        if (!userAccount || !apiAccountValue) {
            console.log('🔍 Validation failed: Missing account data');
            return false;
        }

        // Extract เฉพาะตัวเลข
        const userNumbers = userAccount.replace(/[^0-9]/g, '');
        const apiNumbers = apiAccountValue.replace(/[^0-9]/g, '');
        
        if (!userNumbers || !apiNumbers) {
            console.log('🔍 Validation failed: No numbers found');
            return false;
        }

        // เช็คหลายรูปแบบ
        const checks = [
            // 1. เลขบัญชีเต็ม
            apiNumbers.includes(userNumbers),
            
            // 2. เลขบัญชีไม่รวมหลักสุดท้าย (เผื่อ check digit)
            userNumbers.length > 1 && apiNumbers.includes(userNumbers.slice(0, -1)),
            
            // 3. เลขบัญชีส่วนกลาง (ตัดหน้า 2 หลัง หลัง 1 หลัก)
            userNumbers.length > 4 && apiNumbers.includes(userNumbers.slice(2, -1)),
            
            // 4. เลขบัญชี 8 หลักสุดท้าย
            userNumbers.length >= 6 && apiNumbers.includes(userNumbers.slice(-8)),
            
            // 5. เลขบัญชี 6 หลักสุดท้าย
            userNumbers.length >= 6 && apiNumbers.includes(userNumbers.slice(-6)),
            
            // 6. เลขบัญชี 4 หลักสุดท้าย (สำหรับกรณีพิเศษ)
            userNumbers.length >= 4 && apiNumbers.includes(userNumbers.slice(-4))
        ];
        
        const isValid = checks.some(check => check);
        
        console.log('🔍 Enhanced Account validation:', {
            userAccount: userAccount,
            userNumbers: userNumbers,
            apiPattern: apiAccountValue,
            apiNumbers: apiNumbers,
            checks: {
                fullMatch: checks[0],
                withoutLastDigit: checks[1], 
                middlePart: checks[2],
                last8Digits: checks[3],
                last6Digits: checks[4],
                last4Digits: checks[5]
            },
            result: isValid
        });
        
        return isValid;
        
    } catch (error) {
        console.error('Error in bank account validation:', error);
        return false;
    }
}

// ===============================
// Express Configuration - 🔧 Enhanced
// ===============================

// 🔧 Middleware สำหรับ HTTPS Redirect (เพิ่มใหม่)
app.use((req, res, next) => {
    // ถ้าใช้ Cloudflare และต้องการ Force HTTPS
    if (req.headers['x-forwarded-proto'] === 'http' && USE_HTTPS) {
        return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    next();
});

// 🔧 Trust proxy headers (สำคัญสำหรับ Cloudflare)
app.set('trust proxy', true);

// 🔧 Enhanced CORS Configuration with Domain Support
app.use(cors({
    origin: [
        `http://${DOMAIN}`,        // 🔧 รองรับ http://chatmateth.chat
        `https://${DOMAIN}`,       // 🔧 รองรับ https://chatmateth.chat
        `http://localhost:${PORT}`,
        `http://127.0.0.1:${PORT}`,
        "http://localhost:3000",   // เก็บ default port
        "http://127.0.0.1:3000",   // เก็บ default port
        "*"                        // เก็บไว้สำหรับ development
    ],
    credentials: true              // 🔧 เพิ่ม credentials support
}));

app.use(express.json({ limit: '10mb' })); // เพิ่ม limit สำหรับรูปภาพ
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 🔧 Security Headers สำหรับ HTTPS (เพิ่มใหม่)
app.use((req, res, next) => {
    if (USE_HTTPS) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
    }
    next();
});

app.use(require('express-session')({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: USE_HTTPS, // ใช้ secure cookie เมื่อใช้ HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 ชั่วโมง
    }
}));

function requireHomepageAuth(req, res, next) {
    // ถ้าเป็น API หรือ user pages ให้ผ่าน
    if (req.path.startsWith('/api/') || 
        req.path.startsWith('/user/') || 
        req.path === '/login' || 
        req.path === '/auth') {
        return next();
    }
    
    // ตรวจสอบว่า login แล้วหรือยัง
    if (req.session.homepageAuth) {
        return next();
    }
    
    // ถ้ายังไม่ login ให้ redirect ไปหน้า login
    res.redirect('/login');
}

app.use('/', requireHomepageAuth);

// 🔐 หน้า Login
app.get('/login', (req, res) => {
    const error = req.query.error;
    const html = `
    <!DOCTYPE html>
    <html lang="th">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>🔒 Admin Login - Alert System</title>
        <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: 'Kanit', sans-serif;
                background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%);
                color: #ffffff;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
            }
            
            /* Animated Background */
            .background-animation {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: -1;
                overflow: hidden;
            }
            
            .floating-shapes {
                position: absolute;
                width: 100%;
                height: 100%;
            }
            
            .shape {
                position: absolute;
                background: linear-gradient(45deg, rgba(102, 126, 234, 0.1), rgba(118, 75, 162, 0.1));
                border-radius: 50%;
                animation: float 20s infinite linear;
            }
            
            .shape:nth-child(1) {
                width: 80px;
                height: 80px;
                top: 20%;
                left: 10%;
                animation-delay: 0s;
            }
            
            .shape:nth-child(2) {
                width: 120px;
                height: 120px;
                top: 60%;
                right: 10%;
                animation-delay: 5s;
            }
            
            .shape:nth-child(3) {
                width: 60px;
                height: 60px;
                top: 80%;
                left: 50%;
                animation-delay: 10s;
            }
            
            @keyframes float {
                0%, 100% {
                    transform: translateY(0px) rotate(0deg);
                    opacity: 0.5;
                }
                50% {
                    transform: translateY(-20px) rotate(180deg);
                    opacity: 0.8;
                }
            }
            
            .login-container {
                background: rgba(255, 255, 255, 0.05);
                backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 24px;
                padding: 40px;
                width: 100%;
                max-width: 400px;
                text-align: center;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            }
            
            .logo {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 15px;
                font-size: 28px;
                font-weight: 800;
                background: linear-gradient(135deg, #667eea, #764ba2);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                margin-bottom: 30px;
            }
            
            .logo .icon {
                width: 50px;
                height: 50px;
                background: linear-gradient(135deg, #667eea, #764ba2);
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
                color: white;
                box-shadow: 0 8px 32px rgba(102, 126, 234, 0.3);
            }
            
            h1 {
                font-size: 2em;
                font-weight: 700;
                margin-bottom: 10px;
                background: linear-gradient(135deg, #667eea, #764ba2);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }
            
            .subtitle {
                color: rgba(255, 255, 255, 0.7);
                margin-bottom: 30px;
                font-size: 1.1em;
            }
            
            .form-group {
                margin-bottom: 25px;
                text-align: left;
            }
            
            label {
                display: block;
                margin-bottom: 8px;
                font-weight: 600;
                color: rgba(255, 255, 255, 0.9);
                font-size: 15px;
            }
            
            input[type="password"] {
                width: 100%;
                padding: 16px 20px;
                background: rgba(255, 255, 255, 0.1);
                border: 2px solid rgba(255, 255, 255, 0.2);
                border-radius: 16px;
                color: white;
                font-size: 16px;
                font-family: 'Kanit', sans-serif;
                transition: all 0.3s ease;
            }
            
            input[type="password"]:focus {
                outline: none;
                border-color: #667eea;
                background: rgba(255, 255, 255, 0.15);
                box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.2);
            }
            
            input[type="password"]::placeholder {
                color: rgba(255, 255, 255, 0.5);
            }
            
            .login-btn {
                width: 100%;
                padding: 16px 32px;
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
                border: none;
                border-radius: 16px;
                font-size: 16px;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.3s ease;
                box-shadow: 0 8px 32px rgba(102, 126, 234, 0.3);
                margin-bottom: 20px;
            }
            
            .login-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 12px 40px rgba(102, 126, 234, 0.4);
                background: linear-gradient(135deg, #5a67d8, #6b46c1);
            }
            
            .error-message {
                background: rgba(239, 68, 68, 0.2);
                border: 1px solid rgba(239, 68, 68, 0.3);
                color: #fca5a5;
                padding: 12px 16px;
                border-radius: 12px;
                margin-bottom: 20px;
                font-size: 14px;
            }
            
            .info {
                color: rgba(255, 255, 255, 0.6);
                font-size: 14px;
                line-height: 1.5;
            }
            
            @media (max-width: 480px) {
                .login-container {
                    margin: 20px;
                    padding: 30px;
                }
                
                .logo {
                    font-size: 24px;
                }
                
                h1 {
                    font-size: 1.8em;
                }
            }
        </style>
    </head>
    <body>
        <!-- Animated Background -->
        <div class="background-animation">
            <div class="floating-shapes">
                <div class="shape"></div>
                <div class="shape"></div>
                <div class="shape"></div>
            </div>
        </div>
        
        <div class="login-container">
            <div class="logo">
                <div class="icon">🔒</div>
                <span>Admin Access</span>
            </div>
            
            <h1>เข้าสู่ระบบ</h1>
            <p class="subtitle">กรุณาใส่รหัสผ่านเพื่อเข้าสู่หน้า Admin</p>
            
            ${error ? `<div class="error-message">❌ รหัสผ่านไม่ถูกต้อง</div>` : ''}
            
            <form action="/auth" method="post">
                <div class="form-group">
                    <label for="password">🔑 รหัสผ่าน</label>
                    <input type="password" id="password" name="password" placeholder="ใส่รหัสผ่าน" required autofocus>
                </div>
                
                <button type="submit" class="login-btn">🚀 เข้าสู่ระบบ</button>
            </form>
            
            <div class="info">
                <p>🔐 หน้านี้ป้องกันการเข้าถึงหน้า Admin Dashboard</p>
                <p>📱 User pages ยังคงเข้าได้ปกติโดยไม่ต้องรหัสผ่าน</p>
            </div>
        </div>
        
        <script>
            // Focus on password input
            document.getElementById('password').focus();
            
            // Enter key submit
            document.getElementById('password').addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.target.closest('form').submit();
                }
            });
        </script>
    </body>
    </html>
    `;
    
    res.send(html);
});

// 🔐 ตรวจสอบรหัสผ่าน
app.post('/auth', (req, res) => {
    const { password } = req.body;
    
    if (password === HOMEPAGE_PASSWORD) {
        req.session.homepageAuth = true;
        console.log(`✅ Admin login successful from IP: ${req.ip}`);
        res.redirect('/');
    } else {
        console.log(`❌ Failed admin login attempt from IP: ${req.ip}`);
        res.redirect('/login?error=1');
    }
});

// 🚪 Logout
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/login');
    });
});

// Logging middleware
app.use((req, res, next) => {
    console.log(`📝 ${req.method} ${req.url}`);
    if (Object.keys(req.body).length > 0 && !req.url.includes('/api/verify-slip')) {
        console.log(`📋 Body:`, req.body);
    }
    next();
});

// ===============================
// Username Parameter Middleware
// ===============================
app.param('username', (req, res, next, username) => {
    const validation = userManager.validateUsername(username);
    
    if (!validation.isValid) {
        return res.status(400).json({
            success: false,
            message: `Invalid username: ${validation.errors.join(', ')}`
        });
    }
    
    req.username = username;
    req.userData = userManager.loadUserData(username);
    next();
});

// ===============================
// Socket.io Connection Handling
// ===============================
io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);
    
    socket.on('join-user-room', (username) => {
        if (userManager.validateUsername(username).isValid) {
            socket.join(`user-${username}`);
            console.log(`👤 Socket ${socket.id} joined room: user-${username}`);
        }
    });
    
    socket.on('send-alert', (data) => {
        if (!data.username || !data.name || !data.amount) {
            socket.emit('alert-error', { message: 'Missing required data' });
            return;
        }
        
        try {
            const donationData = {
                name: data.name,
                amount: parseInt(data.amount),
                message: data.message || '',
                paymentMethod: 'manual',
                ip: socket.handshake.address,
                userAgent: socket.handshake.headers['user-agent']
            };
            
            const donation = userManager.addDonation(data.username, donationData);
            
            io.to(`user-${data.username}`).emit('new-alert', {
                id: donation.id,
                name: donation.name,
                amount: donation.amount,
                message: donation.message,
                timestamp: donation.timestamp
            });
            
            socket.emit('alert-sent', { 
                success: true, 
                donation: donation 
            });
            
            console.log(`📢 Manual alert sent for ${data.username}: ${donation.name} - ฿${donation.amount}`);
            
        } catch (error) {
            console.error('Error sending manual alert:', error);
            socket.emit('alert-error', { message: error.message });
        }
    });
    
    socket.on('disconnect', () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
    });
});

// ===============================
// Routes
// ===============================

// 🏠 หน้าแรก
app.get('/', (req, res) => {
    try {
        console.log('📄 Rendering homepage...');
        
        const users = userManager.getAllUsers();
        const globalStats = userManager.getGlobalStats();
        
        let usersList = '';
        
        if (users.length === 0) {
            usersList = `
                <div class="empty-state">
                    <div class="icon">🎮</div>
                    <h3>ยังไม่มี Streamers</h3>
                    <p>เป็นคนแรกที่เริ่มใช้ระบบ Alert ของเรา!</p>
                </div>
            `;
        } else {
            usersList = '<div class="streamers-grid">';
            
            users.forEach(user => {
                const isActive = isUserActive(user.lastActiveAt);
                const statusClass = isActive ? 'status-active' : 'status-inactive';
                const statusText = isActive ? 'Online' : 'Offline';
                const avatarLetter = user.username.charAt(0).toUpperCase();
                
                let paymentMethods = [];
                if (user.enableTrueWallet) paymentMethods.push('TrueWallet');
                if (user.enableBankTransfer) paymentMethods.push('โอนธนาคาร');
                if (paymentMethods.length === 0) paymentMethods.push('Manual');
                
                usersList += `
                    <div class="streamer-card">
                        <div class="card-header">
                            <div class="streamer-info">
                                <div class="avatar">${avatarLetter}</div>
                                <div class="streamer-details">
                                    <h3>${user.username}</h3>
                                    <div class="stream-title">${user.streamTitle}</div>
                                    <div class="payment-methods">💳 ${paymentMethods.join(', ')}</div>
                                </div>
                            </div>
                            <div class="status-badge ${statusClass}">${statusText}</div>
                        </div>
                        
                        <div class="card-stats">
                            <div class="stat-box">
                                <div class="stat-value">${user.totalDonations}</div>
                                <div class="stat-label">Donations</div>
                            </div>
                            <div class="stat-box">
                                <div class="stat-value">฿${user.totalAmount.toLocaleString()}</div>
                                <div class="stat-label">Total</div>
                            </div>
                        </div>
                        
                        <div class="card-actions">
                            <a href="/user/${user.username}/donate" class="action-btn primary">
                                💝 Donate Page
                            </a>
                            <a href="/user/${user.username}/widget" class="action-btn" target="_blank">
                                📺 Widget
                            </a>
                            
                            <div class="more-actions">
                                <a href="/user/${user.username}/control" class="action-btn" target="_blank">
                                    🎮 Alert Test
                                </a>
                                <a href="/user/${user.username}/history" class="action-btn" target="_blank">
                                    📊 History
                                </a>
                                <a href="/user/${user.username}/config" class="action-btn">
                                    ⚙️ Settings
                                </a>
                            </div>
                        </div>
                    </div>
                `;
            });
            
            usersList += '</div>';
        }
        
        console.log('📋 Users HTML length:', usersList.length);
        
        // เพิ่ม logout button และข้อมูล session ใน template
        const html = templateEngine.render('homepage', {
            totalUsers: globalStats.totalUsers,
            totalAmount: globalStats.totalAmount.toLocaleString(),
            totalDonations: globalStats.totalDonations,
            activeUsers: globalStats.activeUsers,
            usersList: usersList
        });
        
        // แทรก logout button ใน header
        const htmlWithLogout = html.replace(
            '<div class="header-stats">',
            `<div class="header-stats">
                <a href="/logout" style="
                    background: rgba(239, 68, 68, 0.2);
                    color: #fca5a5;
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    padding: 8px 16px;
                    border-radius: 12px;
                    text-decoration: none;
                    font-size: 14px;
                    font-weight: 600;
                    transition: all 0.3s ease;
                    margin-right: 20px;
                " onmouseover="this.style.background='rgba(239, 68, 68, 0.3)'" 
                   onmouseout="this.style.background='rgba(239, 68, 68, 0.2)'">
                    🚪 Logout
                </a>`
        );
        
        res.send(htmlWithLogout);
        
    } catch (error) {
        console.error('Error rendering homepage:', error);
        res.status(500).send(`
            <h1>Error</h1>
            <p>เกิดข้อผิดพลาด: ${error.message}</p>
            <p>กรุณาตรวจสอบว่าไฟล์ templates/homepage.html มีอยู่หรือไม่</p>
            <button onclick="history.back()">← กลับไป</button>
        `);
    }
});

// 🆕 สร้าง user ใหม่
app.post('/user/create', (req, res) => {
    try {
        console.log('📝 Create user request:', req.body);
        
        const { username, phone } = req.body;
        
        if (!username || !phone) {
            console.log('❌ Missing data:', { username, phone });
            return res.status(400).send(`
                <!DOCTYPE html>
                <html><head><meta charset="UTF-8"><title>Error</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>❌ ข้อมูลไม่ครบถ้วน</h1>
                    <p>กรุณากรอก Username และเบอร์โทรศัพท์</p>
                    <button onclick="history.back()">← กลับไป</button>
                </body></html>
            `);
        }
        
        const usernameValidation = userManager.validateUsername(username);
        if (!usernameValidation.isValid) {
            console.log('❌ Invalid username:', username, usernameValidation.errors);
            return res.status(400).send(`
                <!DOCTYPE html>
                <html><head><meta charset="UTF-8"><title>Error</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>❌ Username ไม่ถูกต้อง</h1>
                    <p>${usernameValidation.errors.join('<br>')}</p>
                    <button onclick="history.back()">← กลับไป</button>
                </body></html>
            `);
        }
        
        if (!/^[0-9]{10}$/.test(phone)) {
            console.log('❌ Invalid phone:', phone);
            return res.status(400).send(`
                <!DOCTYPE html>
                <html><head><meta charset="UTF-8"><title>Error</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>❌ เบอร์โทรศัพท์ไม่ถูกต้อง</h1>
                    <p>เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก</p>
                    <button onclick="history.back()">← กลับไป</button>
                </body></html>
            `);
        }
        
        if (userManager.userExists(username)) {
            console.log('❌ User already exists:', username);
            return res.status(400).send(`
                <!DOCTYPE html>
                <html><head><meta charset="UTF-8"><title>Error</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>❌ Username นี้มีอยู่แล้ว</h1>
                    <p>กรุณาเลือก Username อื่น</p>
                    <button onclick="history.back()">← กลับไป</button>
                </body></html>
            `);
        }
        
        const userData = userManager.createUser(username, {
            truewalletPhone: phone,
            streamTitle: `${username}'s Stream`
        });
        
        console.log(`✅ New user created: ${username} with phone: ${phone.substring(0, 3)}***${phone.substring(7)}`);
        
        res.redirect(`/user/${username}/config?created=true`);
        
    } catch (error) {
        console.error('❌ Error creating user:', error);
        res.status(500).send(`
            <!DOCTYPE html>
            <html><head><meta charset="UTF-8"><title>Error</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1>❌ เกิดข้อผิดพลาดในระบบ</h1>
                <p>${error.message}</p>
                <button onclick="history.back()">← กลับไป</button>
            </body></html>
        `);
    }
});

// 💝 หน้าโดเนท
app.get('/user/:username/donate', (req, res) => {
    try {
        console.log(`📄 Rendering donate page for: ${req.username}`);
        
        const html = templateEngine.render('donate', {
            username: req.username,
            streamTitle: req.userData.config.streamTitle,
            totalDonations: req.userData.stats.totalDonations,
            totalAmount: req.userData.stats.totalAmount.toLocaleString()
        });
        
        res.send(html);
        
    } catch (error) {
        console.error('Error rendering donate page:', error);
        res.status(500).send(`
            <h1>Error</h1>
            <p>ไม่สามารถแสดงหน้าโดเนทได้: ${error.message}</p>
            <p>กรุณาตรวจสอบว่าไฟล์ templates/donate.html มีอยู่หรือไม่</p>
            <button onclick="history.back()">← กลับไป</button>
        `);
    }
});

// 📺 Alert Widget
app.get('/user/:username/widget', (req, res) => {
    try {
        console.log(`📄 Rendering widget for: ${req.username}`);
        
        const config = req.userData.config;
        
        const html = templateEngine.render('widget', {
            username: req.username,
            streamTitle: config.streamTitle || `${req.username}'s Stream`,
            alertDuration: config.alertDuration || 5000,
            enableTTS: config.enableTTS ? 'true' : 'false',
            enableSound: config.enableSound ? 'true' : 'false',
            minTTSAmount: config.minTTSAmount || 50,
            alertFormat: (config.alertFormat || '{{user}} โดเนท {{amount}}').replace(/"/g, '\\"'),
            showBackground: (config.showBackground === true) ? 'true' : 'false',
            showIcon: (config.showIcon !== false) ? 'true' : 'false',
            showSparkles: (config.showSparkles !== false) ? 'true' : 'false',
            useCustomGif: config.useCustomGif ? 'true' : 'false',
            customGifUrl: config.customGifUrl || '',
            backgroundColor: config.backgroundColor || 'rgba(255, 255, 255, 0.95)',
            textColor: config.textColor || '#1f2937',
            amountColor: config.amountColor || '#f59e0b',
            donorColor: config.donorColor || '#667eea',
            fontSize: config.fontSize || 42,
            amountSize: config.amountSize || 56,
            borderRadius: config.borderRadius || 25,
            animationSpeed: config.animationSpeed || 1.2,
            customCSS: config.customCSS || ''
        });
        
        res.send(html);
        
    } catch (error) {
        console.error('Error rendering widget:', error);
        res.status(500).send(`
            <h1>Widget Error</h1>
            <p>ไม่สามารถแสดง Widget ได้: ${error.message}</p>
            <p>Debug info: ${JSON.stringify({
                username: req.username,
                configExists: !!req.userData,
                configKeys: req.userData ? Object.keys(req.userData.config) : 'none'
            })}</p>
        `);
    }
});

// ⚙️ Config/Settings - 🔧 Enhanced with Domain Support
app.get('/user/:username/config', (req, res) => {
    try {
        console.log(`📄 Loading config page for: ${req.username}`);
        
        const isNewUser = req.query.created === 'true';
        // 🔧 Enhanced Protocol Detection with Domain Support
        const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
        
        // 🔧 Enhanced URL Generation with Domain Support
        const widgetUrl = `${protocol}://${req.get('host')}/user/${req.username}/widget`;
        const donateUrl = `${protocol}://${req.get('host')}/user/${req.username}/donate`;
        
        console.log(`🔗 URLs:`, { widgetUrl, donateUrl });
        console.log(`⚙️ Current config:`, req.userData.config);
        
        // ส่ง config ที่ escape quotes ให้ถูกต้อง
        const configForTemplate = JSON.stringify(req.userData.config).replace(/"/g, '&quot;');
        
        const html = templateEngine.render('config', {
            username: req.username,
            config: configForTemplate,
            isNewUser: isNewUser ? 'block' : 'none',
            widgetUrl: widgetUrl,
            donateUrl: donateUrl
        });
        
        res.send(html);
        
    } catch (error) {
        console.error(`❌ Error rendering config page for ${req.username}:`, error);
        res.status(500).send(`
            <h1>Config Error</h1>
            <p>ไม่สามารถแสดงหน้า Settings ได้: ${error.message}</p>
            <p>กรุณาตรวจสอบว่าไฟล์ templates/config.html มีอยู่หรือไม่</p>
            <button onclick="history.back()">← กลับไป</button>
        `);
    }
});

// 🎮 Control Panel
app.get('/user/:username/control', (req, res) => {
    try {
        console.log(`📄 Rendering control panel for: ${req.username}`);
        
        const html = templateEngine.render('control', {
            username: req.username,
            streamTitle: req.userData.config.streamTitle,
            totalDonations: req.userData.stats.totalDonations,
            totalAmount: req.userData.stats.totalAmount.toLocaleString(),
            recentDonations: JSON.stringify(req.userData.donations.slice(0, 10))
        });
        
        res.send(html);
        
    } catch (error) {
        console.error('Error rendering control panel:', error);
        res.status(500).send(`
            <h1>Control Panel Error</h1>
            <p>ไม่สามารถแสดง Control Panel ได้: ${error.message}</p>
            <p>กรุณาตรวจสอบว่าไฟล์ templates/control.html มีอยู่หรือไม่</p>
            <button onclick="history.back()">← กลับไป</button>
        `);
    }
});

// 📊 History Dashboard
app.get('/user/:username/history', (req, res) => {
    try {
        console.log(`📄 Rendering history for: ${req.username}`);
        
        const html = templateEngine.render('history', {
            username: req.username,
            streamTitle: req.userData.config.streamTitle,
            totalDonations: req.userData.stats.totalDonations,
            totalAmount: req.userData.stats.totalAmount.toLocaleString(),
            averageAmount: req.userData.stats.averageAmount,
            uniqueDonors: req.userData.stats.uniqueDonors
        });
        
        res.send(html);
        
    } catch (error) {
        console.error('Error rendering history:', error);
        res.status(500).send(`
            <h1>History Error</h1>
            <p>ไม่สามารถแสดงหน้า History ได้: ${error.message}</p>
            <p>กรุณาตรวจสอบว่าไฟล์ templates/history.html มีอยู่หรือไม่</p>
            <button onclick="history.back()">← กลับไป</button>
        `);
    }
});

// ===============================
// API Routes
// ===============================

// 💰 API เติมเงิน TrueWallet
app.post('/user/:username/api/redeem-voucher', async (req, res) => {
    try {
        const { voucher_code, donor_name, donor_message } = req.body;
        const phoneNumber = req.userData.config.truewalletPhone;
        
        if (!phoneNumber) {
            return res.status(400).json({
                status: 'FAIL',
                reason: 'ยังไม่ได้ตั้งค่าเบอร์ TrueWallet กรุณาไปที่หน้า Settings'
            });
        }
        
        if (!voucher_code) {
            return res.status(400).json({
                status: 'FAIL',
                reason: 'กรุณากรอกรหัส voucher'
            });
        }
        
        console.log(`🔄 [${req.username}] กำลังเติมเงินด้วย voucher: ${voucher_code.substring(0, 10)}...`);
        
        if (!truewallet) {
            return res.status(500).json({
                status: 'ERROR',
                reason: 'TrueWallet API ไม่พร้อมใช้งาน'
            });
        }
        
        const result = await truewallet.redeemvouchers(phoneNumber, voucher_code);
        
        if (result.status === 'SUCCESS') {
            console.log(`✅ [${req.username}] เติมเงินสำเร็จ: ${result.amount} บาท`);
            
            if (donor_name) {
                const donationData = {
                    name: donor_name,
                    amount: parseInt(result.amount),
                    message: donor_message || '',
                    paymentMethod: 'truewallet',
                    voucherCode: voucher_code,
                    phoneNumber: phoneNumber,
                    ip: req.ip,
                    userAgent: req.get('User-Agent')
                };
                
                const donation = userManager.addDonation(req.username, donationData);
                
                io.to(`user-${req.username}`).emit('new-alert', {
                    id: donation.id,
                    name: donation.name,
                    amount: donation.amount,
                    message: donation.message,
                    timestamp: donation.timestamp
                });
                
                console.log(`🎉 [${req.username}] Donation alert sent:`, donation);
            }
        } else {
            console.log(`❌ [${req.username}] เติมเงินไม่สำเร็จ: ${result.reason}`);
        }
        
        res.json(result);
        
    } catch (error) {
        console.error(`❌ [${req.username}] Error in voucher redemption:`, error);
        res.status(500).json({
            status: 'ERROR',
            reason: 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง'
        });
    }
});

// 🏦 API ตรวจสอบสลิปธนาคาร - Enhanced Version (Auto Amount Detection)
app.post('/user/:username/api/verify-slip', async (req, res) => {
    try {
        const { payload, expected_amount, donor_name, donor_message } = req.body;
        const userData = req.userData;
        
        console.log(`🔍 [${req.username}] Verifying bank slip with enhanced validation...`);
        
        // ตรวจสอบว่าเปิดใช้งานโอนธนาคารหรือไม่
        if (!userData.config.enableBankTransfer) {
            return res.status(400).json({
                success: false,
                reason: 'ระบบโอนธนาคารยังไม่เปิดใช้งาน'
            });
        }

        // ตรวจสอบการตั้งค่าธนาคาร
        const bankValidation = userManager.validateBankSettings(req.username);
        if (!bankValidation.isValid) {
            return res.status(400).json({
                success: false,
                reason: 'การตั้งค่าธนาคารไม่ถูกต้อง: ' + bankValidation.errors.join(', ')
            });
        }

        if (!payload || !donor_name) {
            return res.status(400).json({
                success: false,
                reason: 'ข้อมูลไม่ครบถ้วน'
            });
        }

        console.log(`🔄 [${req.username}] Calling slip verification API...`);

        // เรียก API ตรวจสอบสลิป
        const verifyResponse = await fetch('https://suba.rdcw.co.th/v1/inquiry', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(`${SLIP_CLIENT_ID}:${SLIP_CLIENT_SECRET}`).toString('base64')
            },
            body: JSON.stringify({ payload })
        });

        if (!verifyResponse.ok) {
            console.error(`❌ [${req.username}] Slip API error:`, verifyResponse.status);
            return res.status(500).json({
                success: false,
                reason: 'ไม่สามารถเชื่อมต่อกับระบบตรวจสอบสลิปได้'
            });
        }

        const slipData = await verifyResponse.json();
        console.log(`📋 [${req.username}] Slip verification result:`, {
            valid: slipData.valid,
            amount: slipData.data?.amount,
            receiver: slipData.data?.receiver?.account?.value,
            transRef: slipData.data?.transRef
        });

        // ตรวจสอบความถูกต้องของสลิป
        if (!slipData.valid) {
            return res.json({
                success: false,
                reason: 'สลิปการโอนเงินไม่ถูกต้อง'
            });
        }

        // ดึงจำนวนเงินจากสลิป
        const actualAmount = slipData.data?.amount;
        if (!actualAmount || actualAmount <= 0) {
            return res.json({
                success: false,
                reason: 'ไม่สามารถอ่านจำนวนเงินจากสลิปได้'
            });
        }

        // ตรวจสอบ transaction ซ้ำก่อน (ใช้ transRef และ discriminator)
        const transactionRef = slipData.data?.transRef;
        const discriminator = slipData.discriminator;
        
        if (transactionRef && userManager.isDuplicateTransaction(req.username, transactionRef)) {
            console.log(`❌ [${req.username}] Duplicate transaction ref: ${transactionRef}`);
            return res.json({
                success: false,
                reason: 'สลิปนี้เคยใช้งานแล้ว (Transaction Reference ซ้ำ)'
            });
        }

        if (discriminator && userManager.isDuplicateDiscriminator(req.username, discriminator)) {
            console.log(`❌ [${req.username}] Duplicate discriminator: ${discriminator}`);
            return res.json({
                success: false,
                reason: 'สลิปนี้เคยใช้งานแล้ว (Discriminator ซ้ำ)'
            });
        }

        // ตรวจสอบบัญชีผู้รับด้วย Enhanced Pattern Validation
        const receiverAccount = slipData.data?.receiver?.account?.value;
        const userBankAccount = userData.config.bankAccount;
        
        console.log(`🔍 [${req.username}] Starting enhanced bank account validation...`);
        console.log(`📋 User Account: ${userBankAccount}`);
        console.log(`📋 API Account Pattern: ${receiverAccount}`);
        
        if (!validateBankAccountPattern(userBankAccount, receiverAccount)) {
            console.log(`❌ [${req.username}] Enhanced account validation failed`);
            return res.json({
                success: false,
                reason: 'บัญชีผู้รับเงินไม่ถูกต้อง - ไม่ตรงกับการตั้งค่า'
            });
        }

        console.log(`✅ [${req.username}] Enhanced account validation passed!`);

        // ตรวจสอบจำนวนเงินกับ expected_amount (ถ้ามี)
        if (expected_amount && actualAmount !== expected_amount) {
            console.log(`❌ [${req.username}] Amount mismatch: expected ${expected_amount}, got ${actualAmount}`);
            return res.json({
                success: false,
                reason: `จำนวนเงินไม่ตรงกัน คาดหวัง ฿${expected_amount} แต่พบ ฿${actualAmount}`
            });
        }

        console.log(`✅ [${req.username}] Bank slip verified successfully with auto amount detection: ฿${actualAmount}`);

        // บันทึกการโดเนท
        const donationData = {
            name: donor_name,
            amount: parseInt(actualAmount),
            message: donor_message || '',
            paymentMethod: 'bank_transfer',
            bankName: userData.config.bankName,
            bankAccount: userData.config.bankAccount,
            transactionRef: transactionRef,
            discriminator: discriminator, // เพิ่มการเก็บ discriminator
            slipData: {
                sender: slipData.data?.sender,
                receiver: slipData.data?.receiver,
                transDate: slipData.data?.transDate,
                transTime: slipData.data?.transTime,
                sendingBank: slipData.data?.sendingBank,
                receivingBank: slipData.data?.receivingBank
            },
            ip: req.ip,
            userAgent: req.get('User-Agent')
        };

        const donation = userManager.addDonation(req.username, donationData);

        // ส่ง alert แจ้งเตือน
        io.to(`user-${req.username}`).emit('new-alert', {
            id: donation.id,
            name: donation.name,
            amount: donation.amount,
            message: donation.message,
            timestamp: donation.timestamp
        });

        console.log(`🎉 [${req.username}] Auto-amount bank donation alert sent:`, donation);

        res.json({
            success: true,
            donation: donation,
            verified_amount: actualAmount,
            auto_detected: true, // ระบุว่าเป็นการตรวจหาจำนวนเงินอัตโนมัติ
            transaction_info: {
                transRef: transactionRef,
                transDate: slipData.data?.transDate,
                transTime: slipData.data?.transTime,
                sendingBank: slipData.data?.sendingBank
            }
        });

    } catch (error) {
        console.error(`❌ [${req.username}] Error in auto-amount bank slip verification:`, error);
        res.status(500).json({
            success: false,
            reason: 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง'
        });
    }
});

app.get('/user/:username/api/used-slips', (req, res) => {
    try {
        const userData = userManager.loadUserData(req.username);
        const bankDonations = userData.donations.filter(d => d.paymentMethod === 'bank_transfer');
        
        const usedSlips = bankDonations.map(donation => ({
            id: donation.id,
            transactionRef: donation.transactionRef,
            discriminator: donation.discriminator,
            amount: donation.amount,
            name: donation.name,
            timestamp: donation.timestamp,
            bangkokTime: donation.bangkokTime
        }));
        
        res.json({
            success: true,
            total: usedSlips.length,
            data: usedSlips.slice(0, 100) // แสดง 100 รายการล่าสุด
        });
        
    } catch (error) {
        console.error(`Error getting used slips for ${req.username}:`, error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// เพิ่ม API สำหรับ admin ดูสถิติการใช้สลิป
app.get('/api/admin/slip-usage-stats', (req, res) => {
    try {
        const users = userManager.getAllUsers();
        let totalSlips = 0;
        let uniqueTransRefs = new Set();
        let uniqueDiscriminators = new Set();
        
        users.forEach(user => {
            const userData = userManager.loadUserData(user.username);
            const bankDonations = userData.donations.filter(d => d.paymentMethod === 'bank_transfer');
            
            bankDonations.forEach(donation => {
                totalSlips++;
                if (donation.transactionRef) {
                    uniqueTransRefs.add(donation.transactionRef);
                }
                if (donation.discriminator) {
                    uniqueDiscriminators.add(donation.discriminator);
                }
            });
        });
        
        res.json({
            success: true,
            stats: {
                totalBankTransfers: totalSlips,
                uniqueTransactionRefs: uniqueTransRefs.size,
                uniqueDiscriminators: uniqueDiscriminators.size,
                duplicateAttempts: {
                    transRefs: totalSlips - uniqueTransRefs.size,
                    discriminators: totalSlips - uniqueDiscriminators.size
                }
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🔍 API ทดสอบการเชื่อมต่อ slip verification
app.get('/user/:username/api/test-slip-connection', async (req, res) => {
    try {
        const testResponse = await fetch('https://suba.rdcw.co.th/v1/inquiry', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(`${SLIP_CLIENT_ID}:${SLIP_CLIENT_SECRET}`).toString('base64')
            },
            body: JSON.stringify({ payload: 'test' })
        });

        res.json({
            success: true,
            status: testResponse.status,
            connected: testResponse.ok,
            message: testResponse.ok ? 'เชื่อมต่อ API สำเร็จ' : 'ไม่สามารถเชื่อมต่อ API ได้'
        });

    } catch (error) {
        console.error('Slip API connection test failed:', error);
        res.status(500).json({
            success: false,
            message: 'ไม่สามารถทดสอบการเชื่อมต่อได้',
            error: error.message
        });
    }
});

// 🧪 API ทดสอบ Enhanced Bank Validation
app.post('/user/:username/api/test-bank-validation', async (req, res) => {
    try {
        const { userAccount, apiPattern } = req.body;
        
        if (!userAccount || !apiPattern) {
            return res.status(400).json({
                success: false,
                message: 'กรุณาระบุ userAccount และ apiPattern'
            });
        }
        
        const result = validateBankAccountPattern(userAccount, apiPattern);
        
        res.json({
            success: true,
            userAccount: userAccount,
            apiPattern: apiPattern,
            validationResult: result,
            message: result ? 'ผ่านการตรวจสอบ' : 'ไม่ผ่านการตรวจสอบ'
        });
        
    } catch (error) {
        console.error('Error testing bank validation:', error);
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการทดสอบ',
            error: error.message
        });
    }
});

// ⚙️ API อัพเดท config
app.post('/user/:username/api/config', (req, res) => {
    try {
        const updatedConfig = userManager.updateConfig(req.username, req.body);
        res.json({ 
            success: true, 
            message: 'Configuration updated successfully',
            config: updatedConfig 
        });
    } catch (error) {
        console.error(`Error updating config for ${req.username}:`, error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// ⚙️ API ดึง config
app.get('/user/:username/api/config', (req, res) => {
    try {
        const userData = userManager.loadUserData(req.username);
        res.json({ 
            success: true, 
            config: userData.config 
        });
    } catch (error) {
        console.error(`Error getting config for ${req.username}:`, error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// 📊 API ดู donation logs
app.get('/user/:username/api/donations', (req, res) => {
    try {
        const { page = 1, limit = 50, search = '', dateFrom, dateTo, paymentMethod } = req.query;
        
        // สร้าง criteria สำหรับการค้นหา
        const criteria = {
            search: search,
            dateFrom: dateFrom,
            dateTo: dateTo,
            paymentMethod: paymentMethod
        };

        // ลบ criteria ที่ว่าง
        Object.keys(criteria).forEach(key => {
            if (!criteria[key]) delete criteria[key];
        });

        let donations = userManager.searchDonations(req.username, criteria);
        
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + parseInt(limit);
        const paginatedDonations = donations.slice(startIndex, endIndex);
        
        // คำนวณสถิติสำหรับ search results
        const searchStats = {
            totalDonations: donations.length,
            totalAmount: donations.reduce((sum, d) => sum + d.amount, 0),
            averageAmount: donations.length > 0 ? 
                Math.round(donations.reduce((sum, d) => sum + d.amount, 0) / donations.length) : 0
        };
        
        // คำนวณสถิติวันนี้
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const todayDonations = req.userData.donations.filter(d => new Date(d.timestamp) >= startOfDay);
        
        const userStats = {
            ...req.userData.stats,
            todayDonations: todayDonations.length
        };
        
        res.json({
            success: true,
            data: paginatedDonations,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: donations.length,
                pages: Math.ceil(donations.length / limit)
            },
            stats: searchStats,
            userStats: userStats
        });
        
    } catch (error) {
        console.error(`Error fetching donations for ${req.username}:`, error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch donations',
            error: error.message
        });
    }
});

// 📊 API สถิติการโดเนทแยกตามประเภท
app.get('/user/:username/api/donation-stats', (req, res) => {
    try {
        const stats = userManager.getDonationStatsByMethod(req.username);
        res.json({
            success: true,
            stats: stats
        });
    } catch (error) {
        console.error(`Error getting donation stats for ${req.username}:`, error);
        res.status(500).json({
            success: false,
            message: 'ไม่สามารถดึงสถิติได้'
        });
    }
});

// 📥 API export donations
app.get('/user/:username/api/donations/export', (req, res) => {
    try {
        const { format = 'json' } = req.query;
        
        if (format === 'csv') {
            const exportResult = userManager.exportToCSV(req.username, req.query);
            
            if (exportResult.success) {
                res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
                res.setHeader('Content-Type', 'text/csv');
                res.send(exportResult.content);
            } else {
                res.status(500).json({
                    success: false,
                    message: exportResult.error
                });
            }
        } else {
            // Default JSON export
            const donations = req.userData.donations;
            const filename = `${req.username}_donations_${new Date().toISOString().split('T')[0]}.json`;
            
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify({
                username: req.username,
                exportDate: new Date().toISOString(),
                stats: req.userData.stats,
                donations: donations
            }, null, 2));
        }
        
    } catch (error) {
        console.error(`Error exporting donations for ${req.username}:`, error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// 📥 API import donations
app.post('/user/:username/api/donations/import', (req, res) => {
    try {
        const { csvContent } = req.body;
        
        if (!csvContent) {
            return res.status(400).json({
                success: false,
                message: 'CSV content is required'
            });
        }
        
        const importResult = userManager.importFromCSV(req.username, csvContent);
        res.json(importResult);
        
    } catch (error) {
        console.error(`Error importing donations for ${req.username}:`, error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🔊 API TTS
app.get('/api/tts', async (req, res) => {
    const { text, lang = 'th' } = req.query;
    
    if (!text) {
        return res.status(400).json({ 
            success: false, 
            message: 'Text parameter is required' 
        });
    }
    
    try {
        console.log('🔊 TTS Request:', text.substring(0, 50) + (text.length > 50 ? '...' : ''));
        
        const encodedText = encodeURIComponent(text);
        const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodedText}`;
        
        const googleReq = https.get(googleUrl, (googleRes) => {
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            
            googleRes.pipe(res);
            console.log('✅ TTS served successfully');
        });
        
        googleReq.on('error', (error) => {
            console.error('❌ Google TTS Error:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to fetch TTS audio' 
            });
        });
        
        googleReq.setTimeout(10000, () => {
            googleReq.destroy();
            res.status(408).json({ 
                success: false, 
                message: 'TTS request timeout' 
            });
        });
        
    } catch (error) {
        console.error('❌ TTS API Error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error' 
        });
    }
});

// 🏥 Health check - 🔧 Enhanced with Domain Info
app.get('/health', (req, res) => {
    const health = userManager.getSystemHealth();
    // 🔧 Enhanced Protocol Detection with Domain Support
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    
    res.json({
        status: health.status === 'healthy' ? 'OK' : 'ERROR',
        message: 'Multi-User Alert System with Enhanced Bank Transfer and Domain Support',
        timestamp: new Date().toISOString(),
        // 🔧 เพิ่ม Domain Info ใน Health Check
        domain: DOMAIN,
        protocol: protocol,
        httpsEnabled: USE_HTTPS,
        uptime: process.uptime(),
        features: {
            truewallet: !!truewallet,
            bankTransfer: true,
            slipVerification: true,
            enhancedBankValidation: true,
            domainSupport: true // 🔧 เพิ่ม domain support flag
        },
        health: health
    });
});

// 📊 API สถานะ server - 🔧 Enhanced with Domain Info
app.get('/api/status', (req, res) => {
    const globalStats = userManager.getGlobalStats();
    const systemHealth = userManager.getSystemHealth();
    // 🔧 Enhanced Protocol Detection with Domain Support
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    
    res.json({
        success: true,
        server: 'Multi-User Alert System with Enhanced Bank Transfer and Domain Support',
        version: '2.3.0', // 🔧 เพิ่ม version สำหรับ domain support
        // 🔧 เพิ่ม Domain Info ใน API Status
        domain: DOMAIN,
        protocol: protocol,
        httpsEnabled: USE_HTTPS,
        uptime: process.uptime(),
        connections: io.engine.clientsCount,
        features: {
            truewallet: !!truewallet,
            bankTransfer: true,
            slipVerification: true,
            enhancedBankValidation: true,
            domainSupport: true // 🔧 เพิ่ม domain support flag
        },
        ...globalStats,
        systemHealth: systemHealth,
        timestamp: new Date().toISOString()
    });
});

// 🔧 API สำหรับ admin (ถ้าต้องการ)
app.get('/api/admin/system-health', (req, res) => {
    try {
        const health = userManager.getSystemHealth();
        res.json({
            success: true,
            health: health
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🧹 API สำหรับ cleanup ข้อมูลเก่า
app.post('/api/admin/cleanup', (req, res) => {
    try {
        const { daysOld = 365 } = req.body;
        const result = userManager.cleanupOldData(daysOld);
        
        res.json({
            success: true,
            message: `Cleanup completed: ${result.cleanedDonations} donations removed from ${result.cleanedUsers} users`,
            result: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 💾 API สำหรับ backup
app.post('/api/admin/backup', (req, res) => {
    try {
        const backupPath = userManager.backupAllUsers();
        
        if (backupPath) {
            res.json({
                success: true,
                message: 'Backup created successfully',
                backupPath: backupPath
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to create backup'
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ===============================
// Error Handling
// ===============================
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.stack);
    res.status(500).json({ 
        success: false, 
        message: 'Something went wrong!' 
    });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><title>404 - Page Not Found</title></head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>404 - Page Not Found</h1>
            <p>หน้าที่คุณกำลังมองหาไม่พบ</p>
            <a href="/" style="color: #667eea; text-decoration: none;">← กลับหน้าแรก</a>
        </body>
        </html>
    `);
});

// ===============================
// Start Server - 🔧 Enhanced with Domain Support
// ===============================
// 🔧 เปลี่ยน Server Binding เป็น 0.0.0.0
server.listen(PORT, '0.0.0.0', () => {
    // 🔧 Enhanced Protocol Detection
    const protocol = USE_HTTPS ? 'https' : 'http';
    
    console.log('🎉 =====================================');
    console.log('🚀 Enhanced Multi-User Alert System with Domain Support Started!');
    console.log('🎉 =====================================');
    // 🔧 Enhanced Console Output with Domain Support
    console.log(`🌐 Domain: ${protocol}://${DOMAIN}:${PORT}`);
    console.log(`🏠 Homepage: ${protocol}://${DOMAIN}:${PORT}/`);
    console.log(`📊 API Status: ${protocol}://${DOMAIN}:${PORT}/api/status`);
    console.log(`🏥 Health Check: ${protocol}://${DOMAIN}:${PORT}/health`);
    console.log(`🔒 HTTPS Enabled: ${USE_HTTPS}`);
    console.log(`💾 Users Directory: ${userManager.USER_DATA_DIR}`);
    console.log('🎉 =====================================');
    
    // แสดงรายชื่อ users ที่มีอยู่
    const existingUsers = userManager.getAllUsers();
    if (existingUsers.length > 0) {
        console.log(`👥 Existing Users (${existingUsers.length}):`);
        existingUsers.forEach(user => {
            console.log(`   📺 ${user.username} - ${user.streamTitle}`);
            // 🔧 Enhanced URL Display with Domain Support
            console.log(`      💝 Donate: ${protocol}://${DOMAIN}:${PORT}/user/${user.username}/donate`);
            console.log(`      📺 Widget: ${protocol}://${DOMAIN}:${PORT}/user/${user.username}/widget`);
            console.log(`      🎮 Control: ${protocol}://${DOMAIN}:${PORT}/user/${user.username}/control`);
            console.log(`      ⚙️ Settings: ${protocol}://${DOMAIN}:${PORT}/user/${user.username}/config`);
            
            // แสดงวิธีการรับเงินที่เปิดใช้งาน
            const paymentMethods = [];
            if (user.enableTrueWallet) paymentMethods.push('TrueWallet');
            if (user.enableBankTransfer) paymentMethods.push('Bank Transfer');
            if (paymentMethods.length > 0) {
                console.log(`      💳 Payment Methods: ${paymentMethods.join(', ')}`);
            }
        });
        console.log('🎉 =====================================');
    }
    
    // แสดง feature status
    console.log('🔧 Features Status:');
    console.log(`   🎯 TrueWallet API: ${truewallet ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`   🏦 Bank Transfer: ✅ Enabled`);
    console.log(`   🔍 Slip Verification: ✅ Enabled`);
    console.log(`   🚀 Enhanced Bank Validation: ✅ Enabled`);
    console.log(`   🌐 Domain Support: ✅ Enabled (${DOMAIN})`); // 🔧 เพิ่ม domain status
    console.log(`   🔒 HTTPS Support: ${USE_HTTPS ? '✅ Enabled' : '❌ Disabled'}`); // 🔧 เพิ่ม HTTPS status
    console.log(`   📊 Advanced Analytics: ✅ Enabled`);
    console.log('🎉 =====================================');
    
    // แสดง debug information
    console.log('🔍 Debug Information:');
    templateEngine.debugInfo();
    
    // แสดงสถิติระบบ
    const globalStats = userManager.getGlobalStats();
    console.log('📊 System Statistics:');
    console.log(`   👥 Total Users: ${globalStats.totalUsers}`);
    console.log(`   💰 Total Donations: ${globalStats.totalDonations}`);
    console.log(`   💵 Total Amount: ฿${globalStats.totalAmount.toLocaleString()}`);
    console.log(`   🟢 Active Users (7 days): ${globalStats.activeUsers}`);
    
    // แสดงสถิติการใช้งานตามประเภท
    if (globalStats.paymentMethodUsage) {
        console.log('💳 Payment Method Usage:');
        console.log(`   🎯 TrueWallet Users: ${globalStats.paymentMethodUsage.truewallet}`);
        console.log(`   🏦 Bank Transfer Users: ${globalStats.paymentMethodUsage.bank_transfer}`);
        console.log(`   💯 Both Methods: ${globalStats.paymentMethodUsage.both}`);
    }
    
    console.log('🎉 =====================================');
});

// Graceful Shutdown - 🔧 Enhanced
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    
    // สำรองข้อมูลก่อนปิด
    console.log('📦 Creating backup before shutdown...');
    userManager.backupAllUsers();
    
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    
    // สำรองข้อมูลก่อนปิด
    console.log('📦 Creating backup before shutdown...');
    userManager.backupAllUsers();
    
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    
    // สำรองข้อมูลก่อนปิด
    console.log('📦 Creating emergency backup...');
    userManager.backupAllUsers();
    
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    
    // สำรองข้อมูลก่อนปิด
    console.log('📦 Creating emergency backup...');
    userManager.backupAllUsers();
    
    process.exit(1);
});

module.exports = { app, userManager, templateEngine };